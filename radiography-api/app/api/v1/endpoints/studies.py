import io
import os
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime
from uuid import UUID, uuid4

import aiofiles
import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from PIL import Image
from pydicom import dcmread
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.schemas.study import StudyCreate, StudyListOut, StudyOut, StudyUpdate
from app.services.study_service import StudyService

router = APIRouter(prefix="/studies", tags=["Studies"])

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/jpg"}
ARCHIVE_EXTENSIONS = {".zip", ".rar"}
DICOM_LIKE_EXTENSIONS = {"", ".dcm", ".dicom", ".dicomdir"}


def get_service(db: AsyncSession = Depends(get_db)) -> StudyService:
    return StudyService(db)


# ── Storage helpers ────────────────────────────────────────────────────────

def _study_folder(study_id: UUID) -> str:
    """Every study gets its own folder, named after its UUID. dicom_path
    stores this folder, not a single file — the viewer derives the study_id
    back out of dicom_path by taking the last path segment."""
    folder = os.path.join(settings.DICOM_STORAGE_PATH, str(study_id))
    os.makedirs(folder, exist_ok=True)
    return folder


def _is_image_file(filename: str, content_type: str | None = None) -> bool:
    ext = os.path.splitext(filename)[1].lower()
    if ext in IMAGE_EXTENSIONS:
        return True
    return (content_type or "").lower() in IMAGE_CONTENT_TYPES


def _looks_like_dicom(data: bytes) -> bool:
    """Best-effort check that raw bytes are an actual DICOM dataset, not
    just something that happens to have a DICOM-like extension (or no
    extension at all). Conformant DICOM files have a 128-byte preamble
    followed by the 'DICM' magic — check that first since it's cheap and
    exact. Some legacy/non-conformant exports omit the preamble, so fall
    back to a full pydicom parse attempt before giving up."""
    if len(data) > 132 and data[128:132] == b"DICM":
        return True
    try:
        dcmread(io.BytesIO(data), force=False)
        return True
    except Exception:
        return False


def _count_dicom_like_files(folder: str) -> int:
    """number_of_images should reflect viewable DICOM instances, not every
    attachment that might be sitting in the folder (e.g. a PDF report)."""
    count = 0
    for fname in os.listdir(folder):
        path = os.path.join(folder, fname)
        if not os.path.isfile(path) or fname.startswith("__tmp_"):
            continue
        ext = os.path.splitext(fname)[1].lower()
        if ext in DICOM_LIKE_EXTENSIONS:
            count += 1
    return count


# ── Image → DICOM conversion ─────────────────────────────────────────────

def _image_to_dicom_dataset(image: Image.Image, study) -> FileDataset:
    """Wrap a plain JPEG/PNG image in a minimal DICOM dataset so it can be
    rendered by dwv-style DICOM viewers. Simplified: 8-bit, single-frame,
    Modality "OT" (Other) — there's no real acquisition metadata to recover
    from a plain image."""
    if image.mode not in ("L", "RGB"):
        image = image.convert("RGB")
    pixel_array = np.array(image)
    is_color = image.mode == "RGB"
    rows, cols = pixel_array.shape[0], pixel_array.shape[1]

    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = generate_uid()
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = generate_uid()

    ds = FileDataset(None, {}, file_meta=file_meta, preamble=b"\x00" * 128)
    ds.is_little_endian = True
    ds.is_implicit_VR = False

    ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()

    now = datetime.utcnow()
    ds.StudyDate = now.strftime("%Y%m%d")
    ds.StudyTime = now.strftime("%H%M%S")
    ds.Modality = "OT"

    ds.PatientName = study.patient_name
    ds.PatientID = study.patient_id
    dob = getattr(study, "date_of_birth", None)
    if dob:
        ds.PatientBirthDate = dob.strftime("%Y%m%d") if hasattr(dob, "strftime") else str(dob).replace("-", "")
    ds.PatientSex = (study.sex or "")[:1].upper()

    ds.Rows = rows
    ds.Columns = cols
    ds.SamplesPerPixel = 3 if is_color else 1
    ds.PhotometricInterpretation = "RGB" if is_color else "MONOCHROME2"
    if is_color:
        ds.PlanarConfiguration = 0
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.NumberOfFrames = 1

    ds.PixelData = pixel_array.tobytes()
    return ds


def _save_image_bytes_as_dicom(content: bytes, dest_path: str, study) -> None:
    image = Image.open(io.BytesIO(content))
    image.load()
    ds = _image_to_dicom_dataset(image, study)
    ds.save_as(dest_path, write_like_original=False)


def _save_image_file_as_dicom(src_path: str, dest_path: str, study) -> None:
    image = Image.open(src_path)
    image.load()
    ds = _image_to_dicom_dataset(image, study)
    ds.save_as(dest_path, write_like_original=False)


# ── Archive extraction ───────────────────────────────────────────────────

def _extract_archive(archive_path: str, extract_to: str, ext: str) -> None:
    if ext == ".zip":
        with zipfile.ZipFile(archive_path) as zf:
            zf.extractall(extract_to)
    elif ext == ".rar":
        # Requires the `unar` binary on the host (Homebrew no longer ships
        # `unrar` — install via `brew install unar` on macOS, or
        # `apt-get install unar` on Debian/Ubuntu).
        result = subprocess.run(
            ["unar", "-f", "-D", "-q", "-o", extract_to, archive_path],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Failed to extract .rar archive: "
                    f"{result.stderr.strip() or 'unar not available on server'}"
                ),
            )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported archive type: {ext}")


def _ingest_extracted_files(extract_dir: str, dest_folder: str, study) -> int:
    """Walk an extracted archive. Plain images get converted to DICOM,
    DICOM-like files get copied as-is (after verifying they're actually
    DICOM, not just named like one), anything else (readme, logs, etc.)
    is silently skipped. Returns count of files written."""
    count = 0
    for root, _dirs, files in os.walk(extract_dir):
        for fname in files:
            if fname.startswith("."):
                continue
            src = os.path.join(root, fname)
            ext = os.path.splitext(fname)[1].lower()

            if _is_image_file(fname):
                dest = os.path.join(dest_folder, f"{uuid4().hex}.dcm")
                try:
                    _save_image_file_as_dicom(src, dest, study)
                    count += 1
                except Exception:
                    continue  # not actually a valid image — skip it
            elif ext in DICOM_LIKE_EXTENSIONS:
                try:
                    with open(src, "rb") as f:
                        data = f.read()
                except OSError:
                    continue
                if not _looks_like_dicom(data):
                    # extension matched but the content isn't real DICOM
                    # (e.g. a stray .csv/.txt with no extension) — skip it
                    continue
                dest_name = fname or f"{uuid4().hex}.dcm"
                dest = os.path.join(dest_folder, dest_name)
                if os.path.exists(dest):
                    dest = os.path.join(dest_folder, f"{uuid4().hex}_{dest_name}")
                shutil.copy2(src, dest)
                count += 1
            # else: not DICOM, not an image — skip (e.g. README.txt, logs)
    return count


# ── Routes ────────────────────────────────────────────────────────────────

@router.post("/", response_model=StudyOut, status_code=status.HTTP_201_CREATED)
async def create_study(
    payload: StudyCreate,
    svc: StudyService = Depends(get_service),
):
    return await svc.create(payload)


@router.get("/", response_model=StudyListOut)
async def list_studies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    modality: str | None = None,
    status: str | None = None,
    urgent_only: bool = False,
    svc: StudyService = Depends(get_service),
):
    items, total = await svc.list(page, page_size, modality, status, urgent_only)
    return StudyListOut(total=total, page=page, page_size=page_size, items=items)


@router.get("/{study_id}", response_model=StudyOut)
async def get_study(
    study_id: UUID,
    svc: StudyService = Depends(get_service),
):
    study = await svc.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    return study


@router.get("/{study_id}/files")
async def list_study_files(
    study_id: UUID,
    svc: StudyService = Depends(get_service),
):
    """Returns the filenames inside this study's folder, sorted, so the
    frontend viewer can build full URLs and load the whole series."""
    study = await svc.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if not study.dicom_path or not os.path.isdir(study.dicom_path):
        return {"files": []}
    files = sorted(
        f for f in os.listdir(study.dicom_path)
        if os.path.isfile(os.path.join(study.dicom_path, f)) and not f.startswith("__tmp_")
    )
    return {"files": files}


@router.patch("/{study_id}", response_model=StudyOut)
async def update_study(
    study_id: UUID,
    payload: StudyUpdate,
    svc: StudyService = Depends(get_service),
):
    study = await svc.update(study_id, payload)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    return study


@router.delete("/{study_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_study(
    study_id: UUID,
    svc: StudyService = Depends(get_service),
):
    # Capture dicom_path BEFORE deleting the row — once it's gone we can't look it up
    study = await svc.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    dicom_path = study.dicom_path

    deleted = await svc.delete(study_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Study not found")

    # Remove files after the DB commit succeeds. ignore_errors=True means
    # a missing folder (e.g. study with no uploads) never causes a 500.
    if dicom_path and os.path.isdir(dicom_path):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, lambda: shutil.rmtree(dicom_path, ignore_errors=True)
        )


@router.post("/{study_id}/upload-dicom", response_model=StudyOut)
async def upload_dicom(
    study_id: UUID,
    file: UploadFile = File(...),
    svc: StudyService = Depends(get_service),
):
    study = await svc.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    dest_folder = _study_folder(study_id)
    original_name = file.filename or "upload"
    ext = os.path.splitext(original_name)[1].lower()
    content = await file.read()

    if ext in ARCHIVE_EXTENSIONS:
        with tempfile.TemporaryDirectory() as tmp:
            archive_path = os.path.join(tmp, original_name)
            async with aiofiles.open(archive_path, "wb") as f:
                await f.write(content)

            extract_dir = os.path.join(tmp, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            _extract_archive(archive_path, extract_dir, ext)
            added = _ingest_extracted_files(extract_dir, dest_folder, study)

        if added == 0:
            raise HTTPException(status_code=400, detail="Archive contained no DICOM or image files")

    elif _is_image_file(original_name, file.content_type):
        dest = os.path.join(dest_folder, f"{uuid4().hex}.dcm")
        try:
            _save_image_bytes_as_dicom(content, dest, study)
        except Exception:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid image")

    else:
        # Catch-all branch: previously this wrote *any* file straight into
        # the study's DICOM folder with no validation at all, so something
        # like a stray .csv/.xls would end up sitting alongside (or instead
        # of) real DICOM data and silently break the viewer. Now we reject
        # anything that isn't both DICOM-like by extension *and* verified
        # as an actual DICOM dataset by content.
        if ext not in DICOM_LIKE_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported file type '{ext or '(no extension)'}'. "
                    "Expected a DICOM file, image (.jpg/.png), or .zip/.rar archive."
                ),
            )
        if not _looks_like_dicom(content):
            raise HTTPException(
                status_code=400,
                detail="Uploaded file does not appear to be a valid DICOM dataset.",
            )

        dest_name = original_name
        if os.path.exists(os.path.join(dest_folder, dest_name)):
            dest_name = f"{uuid4().hex}_{original_name}"
        dest = os.path.join(dest_folder, dest_name)
        async with aiofiles.open(dest, "wb") as f:
            await f.write(content)

    return await svc.update(study_id, StudyUpdate(
        dicom_path=dest_folder,
        number_of_images=_count_dicom_like_files(dest_folder),
    ))
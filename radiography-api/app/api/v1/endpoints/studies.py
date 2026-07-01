import asyncio
import io
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from uuid import UUID, uuid4

import aiofiles
import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse  # ← added StreamingResponse
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

_UPLOAD_CHUNK = 1024 * 1024   # 1 MB – stream uploads in this chunk size


def get_service(db: AsyncSession = Depends(get_db)) -> StudyService:
    return StudyService(db)


# ── Storage helpers ────────────────────────────────────────────────────────

def _study_folder(study_id: UUID) -> str:
    folder = os.path.join(settings.DICOM_STORAGE_PATH, str(study_id))
    os.makedirs(folder, exist_ok=True)
    return folder


def _is_image_file(filename: str, content_type: str | None = None) -> bool:
    ext = os.path.splitext(filename)[1].lower()
    if ext in IMAGE_EXTENSIONS:
        return True
    return (content_type or "").lower() in IMAGE_CONTENT_TYPES


def _looks_like_dicom(data: bytes) -> bool:
    """Fast DICOM magic check first, full parse fallback."""
    if len(data) > 132 and data[128:132] == b"DICM":
        return True
    try:
        dcmread(io.BytesIO(data), force=False)
        return True
    except Exception:
        return False


def _looks_like_dicom_path(path: str) -> bool:
    """Read just the header from disk — avoids loading full pixel data."""
    try:
        with open(path, "rb") as f:
            header = f.read(132)
        if len(header) > 132 and header[128:132] == b"DICM":
            return True
        # Non-conformant files: fall back to full parse
        dcmread(path, force=False, stop_before_pixels=True)
        return True
    except Exception:
        return False


def _count_dicom_like_files(folder: str) -> int:
    count = 0
    for fname in os.listdir(folder):
        path = os.path.join(folder, fname)
        if not os.path.isfile(path) or fname.startswith("__tmp_"):
            continue
        ext = os.path.splitext(fname)[1].lower()
        if ext in DICOM_LIKE_EXTENSIONS:
            count += 1
    return count


_WINDOW_CACHE: dict[str, tuple[float, tuple[float, float]]] = {}
_WINDOW_SAMPLE_COUNT = 12


def _folder_auto_window(folder: str) -> tuple[float, float]:
    """One auto-window (wc, ww) for the whole series, not one per slice.

    Letting every slice compute its own 2nd-98th-percentile window
    independently is what produced the banded/interlaced look in the
    coronal/sagittal MPR reconstructions: each column of the reconstructed
    image comes from a different slice, and if every slice picked its own
    contrast stretch, neighboring columns show a visible brightness seam.
    Sampling a handful of slices and pooling their rescaled pixel values
    into one shared window keeps every slice in a series on the same
    contrast scale. Cached per folder (auto-invalidated on mtime change,
    same scheme as the file-order cache) so this only runs once per series.
    """
    try:
        dir_mtime = os.path.getmtime(folder)
    except OSError:
        dir_mtime = 0.0
    cached = _WINDOW_CACHE.get(folder)
    if cached and cached[0] == dir_mtime:
        return cached[1]

    files = _sorted_dicom_files(folder)
    if not files:
        return (40.0, 400.0)  # reasonable CT soft-tissue fallback

    step = max(1, len(files) // _WINDOW_SAMPLE_COUNT)
    sample_files = files[::step][:_WINDOW_SAMPLE_COUNT]

    pooled: list[np.ndarray] = []
    for fname in sample_files:
        try:
            ds = dcmread(os.path.join(folder, fname))
            pix = ds.pixel_array.astype(np.float32)
            slope = float(getattr(ds, "RescaleSlope", 1) or 1)
            intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
            pix = pix * slope + intercept
            pooled.append(pix.reshape(-1))
        except Exception:
            continue

    if not pooled:
        return (40.0, 400.0)

    all_pixels = np.concatenate(pooled)
    lo_pct, hi_pct = np.percentile(all_pixels, [2, 98])
    wc = float((lo_pct + hi_pct) / 2)
    ww = float(max(hi_pct - lo_pct, 1))
    _WINDOW_CACHE[folder] = (dir_mtime, (wc, ww))
    return (wc, ww)


def _dicom_to_jpeg(
    file_path: str,
    wc: float | None,
    ww: float | None,
    quality: int,
    folder: str | None = None,
) -> bytes:
    """Read a DICOM file and return JPEG bytes.
    Applies RescaleSlope/Intercept + window/level → 8-bit → JPEG.
    Result is ~30-60 KB instead of 529 KB raw DICOM = 10× smaller.
    """
    ds = dcmread(file_path)
    pixels = ds.pixel_array.astype(np.float32)

    # Map stored values → Hounsfield Units (essential for CT)
    slope = float(getattr(ds, "RescaleSlope", 1) or 1)
    intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
    pixels = pixels * slope + intercept

    # Use DICOM window tags if caller didn't specify
    if wc is None or ww is None:
        dicom_wc = getattr(ds, "WindowCenter", None)
        dicom_ww = getattr(ds, "WindowWidth", None)
        if dicom_wc is not None and dicom_ww is not None:
            # Some DICOMs store these as sequences
            wc = float(dicom_wc[0] if hasattr(dicom_wc, "__len__") else dicom_wc)
            ww = float(dicom_ww[0] if hasattr(dicom_ww, "__len__") else dicom_ww)
        elif folder is not None:
            # Series-consistent auto-window (see _folder_auto_window) —
            # NOT a per-slice percentile, which is what caused the banding.
            wc, ww = _folder_auto_window(folder)
        else:
            # No folder context (e.g. a standalone call) — fall back to
            # this single slice's own percentile as a last resort.
            lo_pct, hi_pct = np.percentile(pixels, [2, 98])
            wc = float((lo_pct + hi_pct) / 2)
            ww = float(max(hi_pct - lo_pct, 1))

    lo = wc - ww / 2.0
    hi = wc + ww / 2.0
    pixels = np.clip(pixels, lo, hi)
    pixels = ((pixels - lo) / (hi - lo) * 255).astype(np.uint8)

    # Multi-frame DICOM: take first frame only
    if pixels.ndim == 3 and pixels.shape[0] not in (3, 4):
        pixels = pixels[0]

    mode = "RGB" if pixels.ndim == 3 else "L"
    img = Image.fromarray(pixels, mode=mode)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


# ── Image → DICOM conversion ─────────────────────────────────────────────

def _image_to_dicom_dataset(image: Image.Image, study) -> FileDataset:
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
                    continue
            elif ext in DICOM_LIKE_EXTENSIONS:
                if not _looks_like_dicom_path(src):
                    continue
                dest_name = fname or f"{uuid4().hex}.dcm"
                dest = os.path.join(dest_folder, dest_name)
                if os.path.exists(dest):
                    dest = os.path.join(dest_folder, f"{uuid4().hex}_{dest_name}")
                shutil.copy2(src, dest)
                count += 1
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


_NATURAL_SPLIT_RE = re.compile(r"(\d+)")


def _natural_key(name: str) -> list:
    """Numeric-aware fallback so at least filenames like IM1/IM2/IM10 sort
    in the order a human (or a scanner) would expect, when no DICOM header
    ordering is available at all."""
    return [int(tok) if tok.isdigit() else tok.lower() for tok in _NATURAL_SPLIT_RE.split(name)]


def _dicom_sort_key(path: str) -> tuple:
    """Real acquisition order, not filename order.

    Plain lexicographic sort() on filenames scrambles unpadded numeric names
    (IM1, IM10, IM100, ..., IM2, IM20, ...) into something that isn't the
    true slice sequence. That's fine for viewing one axial slice at a time,
    but it corrupts anything that stacks slices along Z — which is exactly
    what the coronal/sagittal MPR reconstruction does, producing the
    banded/interlaced look. Sort on DICOM InstanceNumber first (what the
    scanner actually assigned), falling back to slice position, then to a
    natural filename sort as a last resort for non-conformant files.
    """
    try:
        ds = dcmread(path, stop_before_pixels=True, force=True)
        instance_number = getattr(ds, "InstanceNumber", None)
        if instance_number is not None:
            return (0, int(instance_number))
        slice_location = getattr(ds, "SliceLocation", None)
        if slice_location is not None:
            return (1, float(slice_location))
        position = getattr(ds, "ImagePositionPatient", None)
        if position is not None and len(position) == 3:
            return (1, float(position[2]))
    except Exception:
        pass
    return (2, _natural_key(os.path.basename(path)))


# Per-process cache of sorted order, keyed by folder and auto-invalidated
# whenever the folder's mtime changes (i.e. files were added/removed) —
# avoids re-parsing every DICOM header on every page load/poll.
_FILE_ORDER_CACHE: dict[str, tuple[float, list[str]]] = {}


def _sorted_dicom_files(folder: str) -> list[str]:
    try:
        dir_mtime = os.path.getmtime(folder)
    except OSError:
        dir_mtime = 0.0

    cached = _FILE_ORDER_CACHE.get(folder)
    if cached and cached[0] == dir_mtime:
        return cached[1]

    names = [
        f for f in os.listdir(folder)
        if os.path.isfile(os.path.join(folder, f)) and not f.startswith("__tmp_")
    ]
    names.sort(key=lambda f: _dicom_sort_key(os.path.join(folder, f)))
    _FILE_ORDER_CACHE[folder] = (dir_mtime, names)
    return names


# ── Server-side MPR volume reconstruction ───────────────────────────────
#
# The original MPR implementation built the volume in the browser: download
# every JPEG preview in the series, decode each one onto a canvas, stack the
# pixels. For a several-hundred-slice series that's several hundred HTTP
# round trips plus that many canvas decodes — which is what made the
# coronal/sagittal/3D panes take so long to appear and forced a visible
# "Reconstructing… NN%" progress UI.
#
# Building the volume here instead means one read pass over the raw DICOM
# pixel data (no JPEG encode/decode round trip at all) done once per series,
# cached in memory, after which every coronal/sagittal/MIP request is just a
# numpy slice + single JPEG encode — a few milliseconds.

_VOLUME_MAX_DIM = 320  # same cap the old client-side reconstruction used
_VOLUME_BUILD_WORKERS = 4
_VOLUME_CACHE: dict[str, tuple[float, np.ndarray]] = {}  # key -> (mtime, (depth,height,width) uint8)
_VOLUME_LOCKS: dict[str, asyncio.Lock] = {}
_VOLUME_LOCKS_GUARD = asyncio.Lock()


def _partition_files(files: list[str], series: int, series_count: int) -> list[str]:
    """Mirrors the frontend's partitionBySeries() so a given (series,
    series_count) pair always refers to the same slice range on both sides."""
    if not files or series_count <= 1:
        return files
    chunk = max(1, len(files) // series_count)
    start = series * chunk
    end = len(files) if series == series_count - 1 else start + chunk
    return files[start:end]


def _read_and_window_slice(path: str, lo: float, hi: float, denom: float) -> np.ndarray | None:
    try:
        ds = dcmread(path)
        pix = ds.pixel_array.astype(np.float32)
        if pix.ndim == 3 and pix.shape[0] not in (3, 4):
            pix = pix[0]
        slope = float(getattr(ds, "RescaleSlope", 1) or 1)
        intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
        pix = pix * slope + intercept
        pix = np.clip(pix, lo, hi)
        return ((pix - lo) / denom * 255).astype(np.uint8)
    except Exception:
        return None


def _resize_gray(arr: np.ndarray, width: int, height: int) -> np.ndarray:
    if arr.shape[1] == width and arr.shape[0] == height:
        return arr
    img = Image.fromarray(arr, mode="L")
    return np.array(img.resize((width, height), Image.BILINEAR))


def _build_volume(folder: str, files: list[str]) -> np.ndarray:
    """Reads every slice's raw pixel data directly (threaded — I/O + native
    decompression release the GIL, so this isn't fully serial even under
    Python), applies the same series-consistent window used for the 2D
    previews, downsamples in-plane, and stacks into one (depth, height,
    width) uint8 volume."""
    wc, ww = _folder_auto_window(folder)
    lo = wc - ww / 2.0
    hi = wc + ww / 2.0
    denom = max(hi - lo, 1e-6)
    paths = [os.path.join(folder, f) for f in files]

    with ThreadPoolExecutor(max_workers=_VOLUME_BUILD_WORKERS) as pool:
        raw = list(pool.map(lambda p: _read_and_window_slice(p, lo, hi, denom), paths))

    decoded = [r for r in raw if r is not None]
    if not decoded:
        raise ValueError("No slices could be decoded for this series")

    h0, w0 = decoded[0].shape[:2]
    scale = min(1.0, _VOLUME_MAX_DIM / max(h0, w0))
    width = max(1, round(w0 * scale))
    height = max(1, round(h0 * scale))

    resized = [_resize_gray(s, width, height) for s in decoded]
    return np.stack(resized, axis=0)  # (depth, height, width)


async def _get_volume(folder: str, series: int, series_count: int) -> np.ndarray:
    """Cached per (folder, series, series_count), invalidated on folder
    mtime change. A per-key asyncio.Lock ensures that when MPR mode turns on
    and meta/coronal/sagittal/mip are all requested at once on a cold cache,
    only one of them actually builds the volume — the rest just wait on the
    same build instead of each redoing it."""
    key = f"{folder}|{series}|{series_count}"
    try:
        dir_mtime = os.path.getmtime(folder)
    except OSError:
        dir_mtime = 0.0

    cached = _VOLUME_CACHE.get(key)
    if cached and cached[0] == dir_mtime:
        return cached[1]

    async with _VOLUME_LOCKS_GUARD:
        lock = _VOLUME_LOCKS.get(key)
        if lock is None:
            lock = asyncio.Lock()
            _VOLUME_LOCKS[key] = lock

    async with lock:
        cached = _VOLUME_CACHE.get(key)
        if cached and cached[0] == dir_mtime:
            return cached[1]
        files = _partition_files(_sorted_dicom_files(folder), series, series_count)
        if not files:
            raise ValueError("No slices available for this series")
        loop = asyncio.get_event_loop()
        volume = await loop.run_in_executor(None, _build_volume, folder, files)
        _VOLUME_CACHE[key] = (dir_mtime, volume)
        return volume


def _plane_to_jpeg(plane: np.ndarray, quality: int) -> bytes:
    img = Image.fromarray(np.ascontiguousarray(plane), mode="L")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


async def _load_study_volume(study_id: UUID, series: int, series_count: int, svc: StudyService) -> np.ndarray:
    study = await svc.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if not study.dicom_path or not os.path.isdir(study.dicom_path):
        raise HTTPException(status_code=404, detail="No DICOM files for this study")
    try:
        return await _get_volume(study.dicom_path, series, series_count)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{study_id}/mpr/meta")
async def get_mpr_meta(
    study_id: UUID,
    series: int = Query(default=0, ge=0),
    series_count: int = Query(default=1, ge=1),
    svc: StudyService = Depends(get_service),
):
    volume = await _load_study_volume(study_id, series, series_count, svc)
    depth, height, width = volume.shape
    return {"width": width, "height": height, "depth": depth}


@router.get("/{study_id}/mpr/coronal")
async def get_mpr_coronal(
    study_id: UUID,
    y: int = Query(default=0, ge=0),
    series: int = Query(default=0, ge=0),
    series_count: int = Query(default=1, ge=1),
    quality: int = Query(default=85, ge=50, le=95),
    svc: StudyService = Depends(get_service),
):
    volume = await _load_study_volume(study_id, series, series_count, svc)
    depth, height, width = volume.shape
    yy = max(0, min(height - 1, y))
    loop = asyncio.get_event_loop()
    jpeg_bytes = await loop.run_in_executor(None, _plane_to_jpeg, volume[:, yy, :], quality)
    return StreamingResponse(
        io.BytesIO(jpeg_bytes),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600", "Content-Length": str(len(jpeg_bytes))},
    )


@router.get("/{study_id}/mpr/sagittal")
async def get_mpr_sagittal(
    study_id: UUID,
    x: int = Query(default=0, ge=0),
    series: int = Query(default=0, ge=0),
    series_count: int = Query(default=1, ge=1),
    quality: int = Query(default=85, ge=50, le=95),
    svc: StudyService = Depends(get_service),
):
    volume = await _load_study_volume(study_id, series, series_count, svc)
    depth, height, width = volume.shape
    xx = max(0, min(width - 1, x))
    loop = asyncio.get_event_loop()
    jpeg_bytes = await loop.run_in_executor(None, _plane_to_jpeg, volume[:, :, xx], quality)
    return StreamingResponse(
        io.BytesIO(jpeg_bytes),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600", "Content-Length": str(len(jpeg_bytes))},
    )


@router.get("/{study_id}/mpr/mip")
async def get_mpr_mip(
    study_id: UUID,
    series: int = Query(default=0, ge=0),
    series_count: int = Query(default=1, ge=1),
    quality: int = Query(default=85, ge=50, le=95),
    svc: StudyService = Depends(get_service),
):
    volume = await _load_study_volume(study_id, series, series_count, svc)
    loop = asyncio.get_event_loop()

    def _mip() -> bytes:
        return _plane_to_jpeg(np.max(volume, axis=1), quality)

    jpeg_bytes = await loop.run_in_executor(None, _mip)
    return StreamingResponse(
        io.BytesIO(jpeg_bytes),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600", "Content-Length": str(len(jpeg_bytes))},
    )


@router.get("/{study_id}/files")
async def list_study_files(
    study_id: UUID,
    svc: StudyService = Depends(get_service),
):
    """Returns filenames in true acquisition order (DICOM InstanceNumber /
    SliceLocation), not filename order, so the viewer can build full WADO
    URLs and reliably stack slices for MPR reconstruction."""
    study = await svc.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if not study.dicom_path or not os.path.isdir(study.dicom_path):
        return {"files": []}
    loop = asyncio.get_event_loop()
    files = await loop.run_in_executor(None, _sorted_dicom_files, study.dicom_path)
    return {"files": files}


@router.get("/{study_id}/dicom/{filename}")
async def serve_dicom_file(
    study_id: UUID,
    filename: str,
    svc: StudyService = Depends(get_service),
):
    """Serve raw DICOM bytes for Cornerstone's WADO URI loader."""
    study = await svc.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if not study.dicom_path or not os.path.isdir(study.dicom_path):
        raise HTTPException(status_code=404, detail="No DICOM files for this study")

    if not filename or "/" in filename or "\\" in filename or filename.startswith(".."):
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = os.path.join(study.dicom_path, filename)
    real_file = os.path.realpath(file_path)
    real_root = os.path.realpath(study.dicom_path)
    if not real_file.startswith(real_root + os.sep):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found")

    return FileResponse(
        file_path,
        media_type="application/dicom",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/{study_id}/dicom/{filename}/preview")
async def serve_dicom_preview(
    study_id: UUID,
    filename: str,
    wc: float | None = Query(default=None, description="Window center (HU)"),
    ww: float | None = Query(default=None, description="Window width (HU)"),
    quality: int = Query(default=80, ge=50, le=95),
    svc: StudyService = Depends(get_service),
):
    """Serve a JPEG preview of one DICOM slice.
    ~30-60 KB vs 529 KB raw DICOM → 10× faster browser loading.
    Cached 24 h so repeat visits are instant.
    """
    study = await svc.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if not study.dicom_path or not os.path.isdir(study.dicom_path):
        raise HTTPException(status_code=404, detail="No DICOM files for this study")

    if not filename or "/" in filename or "\\" in filename or filename.startswith(".."):
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = os.path.join(study.dicom_path, filename)
    real_file = os.path.realpath(file_path)
    real_root = os.path.realpath(study.dicom_path)
    if not real_file.startswith(real_root + os.sep):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found")

    loop = asyncio.get_event_loop()
    jpeg_bytes: bytes = await loop.run_in_executor(
        None, _dicom_to_jpeg, file_path, wc, ww, quality, study.dicom_path
    )

    return StreamingResponse(
        io.BytesIO(jpeg_bytes),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=86400",   # 24 h browser cache
            "Content-Length": str(len(jpeg_bytes)),
        },
    )


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
    study = await svc.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    dicom_path = study.dicom_path

    deleted = await svc.delete(study_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Study not found")

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
    loop = asyncio.get_event_loop()

    if ext in ARCHIVE_EXTENSIONS:
        with tempfile.TemporaryDirectory() as tmp:
            archive_path = os.path.join(tmp, original_name)

            async with aiofiles.open(archive_path, "wb") as f:
                while True:
                    chunk = await file.read(_UPLOAD_CHUNK)
                    if not chunk:
                        break
                    await f.write(chunk)

            extract_dir = os.path.join(tmp, "extracted")
            os.makedirs(extract_dir, exist_ok=True)

            await loop.run_in_executor(
                None, _extract_archive, archive_path, extract_dir, ext,
            )
            added: int = await loop.run_in_executor(
                None, _ingest_extracted_files, extract_dir, dest_folder, study,
            )

        if added == 0:
            raise HTTPException(
                status_code=400, detail="Archive contained no DICOM or image files",
            )

    elif _is_image_file(original_name, file.content_type):
        content = await file.read()
        dest = os.path.join(dest_folder, f"{uuid4().hex}.dcm")
        try:
            await loop.run_in_executor(
                None, _save_image_bytes_as_dicom, content, dest, study,
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid image")

    else:
        if ext not in DICOM_LIKE_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported file type '{ext or '(no extension)'}'. "
                    "Expected a DICOM file, image (.jpg/.png), or .zip/.rar archive."
                ),
            )

        dest_name = original_name or f"{uuid4().hex}.dcm"
        if os.path.exists(os.path.join(dest_folder, dest_name)):
            dest_name = f"{uuid4().hex}_{dest_name}"
        dest = os.path.join(dest_folder, dest_name)

        async with aiofiles.open(dest, "wb") as f:
            while True:
                chunk = await file.read(_UPLOAD_CHUNK)
                if not chunk:
                    break
                await f.write(chunk)

        is_dcm: bool = await loop.run_in_executor(None, _looks_like_dicom_path, dest)
        if not is_dcm:
            os.remove(dest)
            raise HTTPException(
                status_code=400,
                detail="Uploaded file does not appear to be a valid DICOM dataset.",
            )

    return await svc.update(study_id, StudyUpdate(
        dicom_path=dest_folder,
        number_of_images=_count_dicom_like_files(dest_folder),
    ))
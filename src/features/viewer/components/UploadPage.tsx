import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronUp, Files } from "lucide-react";
import PacsConnectionCard from "../Pacsconnectioncard";
import { type UploadedFile, type PatientForm, EMPTY_FORM } from "../types";
import AutoArrivalGuide from "./Autoarrivalguide";
import ConnectedDevicesCard from "./Connecteddevicescard";
import DicomDropZone from "./Dicomdropzone";
import PatientInfoForm from "./Patientinfoform";
import UploadSuccessModal from "./Uploadsuccessmodal";
import {
  createStudy,
  uploadDicomBatch,
  deleteStudy,
} from "../../../services/studyService";
import { useStudies } from "../../../context/StudyContext";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileKey = (f: File) => `${f.name}-${f.size}`;

/** Auto-collapse the file list once this many files are queued */
const AUTO_COLLAPSE_AT = 5;

export default function UploadPage() {
  const navigate = useNavigate();
  const { refresh } = useStudies();

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStage, setUploadStage] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");
  const [filesExpanded, setFilesExpanded] = useState(true);

  const isSubmittingRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Prevent accidental refresh / navigation during upload ──────────────────
  // Without this, a refresh mid-upload creates an orphan study record with
  // 0 images in the worklist — the upload page disappears but no success
  // message is shown, and the DICOM viewer finds nothing to display.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isSubmitting) {
        e.preventDefault();
        // Setting returnValue triggers the browser's built-in "Leave site?" dialog
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isSubmitting]);

  // ── File handling ──────────────────────────────────────────────────────────
  // ZIP files are queued as-is and sent directly to the backend.
  // Previously, ZIPs were extracted in the browser (slow, memory-intensive)
  // and then re-bundled for upload — a double round-trip that made large
  // studies take much longer than necessary.
  //
  // IMPORTANT: your backend's upload endpoint must accept .zip files and
  // extract them server-side. If uploadDicomBatch currently re-bundles files
  // into a ZIP before sending, update it to POST files via multipart FormData
  // instead so ZIPs aren't double-wrapped.
  const addFiles = (incoming: File[]) => {
    setRawFiles((prevRaw) => {
      const existingKeys = new Set(prevRaw.map(fileKey));
      const fresh = incoming.filter((f) => !existingKeys.has(fileKey(f)));
      if (fresh.length === 0) return prevRaw;

      const startIdx = prevRaw.length;
      const totalAfter = startIdx + fresh.length;

      if (totalAfter > AUTO_COLLAPSE_AT) setFilesExpanded(false);

      const mapped: UploadedFile[] = fresh.map((f) => ({
        name: f.name,
        size: formatSize(f.size),
        // Files are ready immediately — no client-side scanning needed
        progress: 100,
        done: true,
      }));

      setFiles((pf) => [...pf, ...mapped]);
      return [...prevRaw, ...fresh];
    });
  };

  const removeFile = (idx: number) => {
    setFiles((pf) => pf.filter((_, i) => i !== idx));
    setRawFiles((pr) => pr.filter((_, i) => i !== idx));
  };

  // ── Form handling ──────────────────────────────────────────────────────────
  const patchForm = (patch: Partial<PatientForm>) =>
    setForm((p) => ({ ...p, ...patch }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.patientName) e.patientName = "Required";
    if (!form.patientId) e.patientId = "Required";
    if (!form.modality) e.modality = "Required";
    if (!form.description) e.description = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    if (!validate()) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setUploadError("");

    try {
      // 1. Create study record
      setUploadStage("Creating study record…");
      const study = await createStudy({
        patient_name: form.patientName,
        patient_id: form.patientId,
        date_of_birth: form.dob || undefined,
        sex: form.sex || undefined,
        modality: form.modality,
        description: form.description,
        referring_doctor: form.referringDoctor || undefined,
        institution: form.institution || undefined,
        clinical_history: form.clinicalHistory || undefined,
        is_urgent: form.urgent,
      });

      // 2. Upload files (ZIPs sent directly — backend extracts them)
      if (rawFiles.length > 0) {
        const zipCount = rawFiles.filter((f) =>
          f.name.toLowerCase().endsWith(".zip"),
        ).length;
        const dicomCount = rawFiles.length - zipCount;

        let stageMsg = "";
        if (zipCount > 0 && dicomCount > 0) {
          stageMsg = `Uploading ${zipCount} ZIP archive${zipCount !== 1 ? "s" : ""} and ${dicomCount} file${dicomCount !== 1 ? "s" : ""}…`;
        } else if (zipCount > 0) {
          stageMsg = `Uploading ${zipCount} ZIP archive${zipCount !== 1 ? "s" : ""}…`;
        } else {
          stageMsg = `Uploading ${dicomCount} DICOM file${dicomCount !== 1 ? "s" : ""}…`;
        }
        setUploadStage(stageMsg);

        try {
          // await uploadDicomBatch(study.id, rawFiles);
          await uploadDicomBatch(study.id, rawFiles, (done, total) => {
            setUploadStage(`Uploading files… ${done} of ${total}`);
          });
        } catch (uploadErr) {
          // File upload failed — delete the orphan study record immediately so
          // a "pending / 0 images" row doesn't linger in the worklist.
          setUploadStage("Cleaning up…");
          try {
            await deleteStudy(study.id);
          } catch {
            /* best-effort */
          }
          throw uploadErr;
        }
      }

      // 3. Refresh worklist BEFORE showing the modal so the list is already
      //    current when the user clicks "View in Worklist".
      setUploadStage("Refreshing worklist…");
      await refresh();

      // 4. Show success — this unmounts the form, preventing a second submit
      setSubmitted(true);
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadError(
        err instanceof Error
          ? err.message
          : "Upload failed — please try again.",
      );
      setUploadStage("");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setSubmitted(false);
    setFiles([]);
    setRawFiles([]);
    setForm(EMPTY_FORM);
    setErrors({});
    setUploadStage("");
    setUploadError("");
    setFilesExpanded(true);
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <UploadSuccessModal
        form={form}
        onViewWorklist={() => navigate("/studies")}
        onUploadAnother={reset}
      />
    );
  }

  const hasFiles = files.length > 0;
  const pad = isMobile ? "16px" : "32px";

  return (
    <div
      style={{
        padding: pad,
        background: "#F8FAFF",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>

      {/* ── Blocking upload overlay ──────────────────────────────────────────
           A full-screen modal rather than an inline banner. This makes it
           impossible to accidentally click away or refresh while uploading,
           and gives the user clear feedback without them having to scroll
           back up to find the status banner.                                  */}
      {isSubmitting && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "20px",
              padding: "36px 28px",
              maxWidth: "340px",
              width: "100%",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            {/* Spinner */}
            <div
              style={{
                width: "52px",
                height: "52px",
                border: "4px solid #fed7aa",
                borderTopColor: "#EA580C",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 20px",
              }}
            />
            <div
              style={{
                fontWeight: 700,
                fontSize: "18px",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              Uploading Study
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#6b7280",
                marginBottom: "20px",
                minHeight: "20px",
              }}
            >
              {uploadStage}
            </div>
            <div
              style={{
                background: "#FFF7ED",
                border: "1px solid #fed7aa",
                borderRadius: "10px",
                padding: "10px 14px",
                fontSize: "12px",
                color: "#9a3412",
                fontWeight: 500,
              }}
            >
              Don't close or refresh this tab
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "24px" }}>
        <h2
          style={{
            fontSize: isMobile ? "20px" : "24px",
            fontWeight: 700,
            color: "#111827",
            margin: 0,
          }}
        >
          Upload Study
        </h2>
        <p style={{ fontSize: "13px", color: "#6b7280", margin: "4px 0 0 0" }}>
          Upload to the PACS server
        </p>
      </div>

      {/* ── Auto-arrival info banner ─────────────────────────────────────────── */}
      <div
        style={{
          background: "#EBF3FF",
          border: "1px solid #bfdbfe",
          borderRadius: "12px",
          padding: "14px 16px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
        }}
      >
        <AlertTriangle
          size={16}
          color="#1A73E8"
          style={{ flexShrink: 0, marginTop: "1px" }}
        />
        <div style={{ fontSize: "13px", color: "#1e40af", lineHeight: 1.5 }}>
          <strong>How studies arrive automatically:</strong> CT, MRI, and X-ray
          machines can be configured to send images directly to this PACS
          server. No manual upload needed — the study appears in the worklist
          immediately.
        </div>
      </div>

      {/* ── Upload error banner ──────────────────────────────────────────────── */}
      {uploadError && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "#991b1b", fontWeight: 600 }}>
            {uploadError}
          </span>
        </div>
      )}

      {/* ── Two-column layout ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "20px",
        }}
      >
        {/* ─── Left column ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* ── File section ──────────────────────────────────────────────────── */}
          <div>
            {/* Collapse / expand toggle — appears once files are queued */}
            {hasFiles && (
              <div
                role="button"
                aria-expanded={filesExpanded}
                onClick={() => setFilesExpanded((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderBottom: filesExpanded ? "none" : undefined,
                  borderRadius: filesExpanded ? "12px 12px 0 0" : "12px",
                  padding: "10px 14px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Files size={15} color="#6b7280" />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#374151",
                    }}
                  >
                    {files.length} file{files.length !== 1 ? "s" : ""} · ready
                  </span>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  {filesExpanded ? (
                    <ChevronUp size={15} color="#6b7280" />
                  ) : (
                    <ChevronDown size={15} color="#6b7280" />
                  )}
                </div>
              </div>
            )}

            {/* DicomDropZone — hidden via CSS (not unmounted) so drop listeners stay alive */}
            <div style={{ display: filesExpanded ? "block" : "none" }}>
              <DicomDropZone
                files={files}
                onFilesAdded={addFiles}
                onRemove={removeFile}
              />
            </div>

            {/* "Add more files" shortcut while list is collapsed */}
            {hasFiles && !filesExpanded && (
              <button
                onClick={() => setFilesExpanded(true)}
                style={{
                  marginTop: "6px",
                  width: "100%",
                  padding: "9px",
                  background: "transparent",
                  border: "1.5px dashed #d1d5db",
                  borderRadius: "10px",
                  color: "#6b7280",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                + Expand to add more files
              </button>
            )}
          </div>

          {hasFiles && (
            <button
              onClick={() =>
                formRef.current?.scrollIntoView({ behavior: "smooth" })
              }
              style={{
                padding: "9px 16px",
                background: "#EBF3FF",
                border: "1px solid #bfdbfe",
                borderRadius: "10px",
                color: "#1A73E8",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                width: "100%",
              }}
            >
              ↓ Jump to Patient Form
            </button>
          )}

          {/* ── Patient info form ────────────────────────────────────────────── */}
          <div ref={formRef}>
            <PatientInfoForm
              form={form}
              errors={errors}
              isMobile={isMobile}
              onChange={patchForm}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>

        {/* ─── Right column ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <PacsConnectionCard />
          <ConnectedDevicesCard />
          <AutoArrivalGuide />
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import PacsConnectionCard from "../Pacsconnectioncard";
import { type UploadedFile, type PatientForm, EMPTY_FORM } from "../types";
import AutoArrivalGuide from "./Autoarrivalguide";
import ConnectedDevicesCard from "./Connecteddevicescard";
import DicomDropZone from "./Dicomdropzone";
import PatientInfoForm from "./Patientinfoform";
import UploadSuccessModal from "./Uploadsuccessmodal";
import { createStudy, uploadDicom } from "../../../services/studyService";
import { useStudies } from "../../../context/StudyContext";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Stable identity key for deduplication — name + size is good enough for DICOM
const fileKey = (f: File) => `${f.name}-${f.size}`;

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

  // ── Synchronous submit guard ────────────────────────────────────────────────
  // useRef is synchronous — both rapid clicks read the SAME ref value before
  // any re-render, so only the first call ever proceeds. useState is async and
  // cannot reliably block a second call that arrives in the same event loop tick.
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── File handling ───────────────────────────────────────────────────────────
  const addFiles = (newFiles: File[]) => {
    // Deduplicate against what's already queued — dropzones often fire both
    // onDrop and onChange for the same drop, which previously caused each file
    // to appear twice in rawFiles and get uploaded twice.
    setRawFiles((prev) => {
      const existingKeys = new Set(prev.map(fileKey));
      const fresh = newFiles.filter((f) => !existingKeys.has(fileKey(f)));
      if (fresh.length === 0) return prev;

      // Kick off the fake progress animation for each genuinely new file.
      // We do this inside setRawFiles so `prev.length` is always accurate
      // and we never read stale state from the render closure.
      const startIdx = prev.length;
      const mapped: UploadedFile[] = fresh.map((f) => ({
        name: f.name,
        size: formatSize(f.size),
        progress: 0,
        done: false,
      }));

      setFiles((prevFiles) => [...prevFiles, ...mapped]);

      mapped.forEach((_, i) => {
        const idx = startIdx + i;
        let prog = 0;
        const interval = setInterval(() => {
          prog += Math.random() * 20 + 10;
          if (prog >= 100) {
            clearInterval(interval);
            setFiles((pf) =>
              pf.map((f, fi) =>
                fi === idx ? { ...f, progress: 100, done: true } : f,
              ),
            );
          } else {
            setFiles((pf) =>
              pf.map((f, fi) =>
                fi === idx ? { ...f, progress: Math.round(prog) } : f,
              ),
            );
          }
        }, 300);
      });

      return [...prev, ...fresh];
    });
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setRawFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Form handling ───────────────────────────────────────────────────────────
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
    // Synchronous ref check — blocks re-entrancy before any state update
    if (isSubmittingRef.current) return;
    if (!validate()) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);

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

      // 2. Upload all DICOM files in parallel — one round-trip instead of N
      if (rawFiles.length > 0) {
        setUploadStage(
          `Uploading ${rawFiles.length} file${rawFiles.length > 1 ? "s" : ""}…`,
        );
        await Promise.all(rawFiles.map((file) => uploadDicom(study.id, file)));
      }

      // 3. Refresh worklist so the new study is visible immediately
      setUploadStage("Finalizing…");
      await refresh();

      setSubmitted(true);
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadStage("");
    } finally {
      // Always release both the ref and the state lock
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
  };

  // ── Render: success ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <UploadSuccessModal
        form={form}
        onViewWorklist={() => navigate("/studies")}
        onUploadAnother={reset}
      />
    );
  }

  const pad = isMobile ? "16px" : "32px";

  // ── Render: upload form ─────────────────────────────────────────────────────
  return (
    <div
      style={{
        padding: pad,
        background: "#F8FAFF",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
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

      {/* Info banner */}
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

      {/* Upload-in-progress banner */}
      {isSubmitting && (
        <div
          style={{
            background: "#FFF7ED",
            border: "1px solid #fed7aa",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div
            style={{
              width: "16px",
              height: "16px",
              border: "2px solid #fed7aa",
              borderTopColor: "#EA580C",
              borderRadius: "50%",
              animation: "upload-spin 0.8s linear infinite",
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: "13px", color: "#9a3412", fontWeight: 600 }}>
            {uploadStage}
          </div>
          <style>{`@keyframes upload-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <DicomDropZone
            files={files}
            onFilesAdded={addFiles}
            onRemove={removeFile}
          />
          <PatientInfoForm
            form={form}
            errors={errors}
            isMobile={isMobile}
            onChange={patchForm}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <PacsConnectionCard />
          <ConnectedDevicesCard />
          <AutoArrivalGuide />
        </div>
      </div>
    </div>
  );
}
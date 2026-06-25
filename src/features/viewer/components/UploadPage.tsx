import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronUp, FileArchive, Files } from "lucide-react";
import PacsConnectionCard from "../Pacsconnectioncard";
import { type UploadedFile, type PatientForm, EMPTY_FORM } from "../types";
import AutoArrivalGuide from "./Autoarrivalguide";
import ConnectedDevicesCard from "./Connecteddevicescard";
import DicomDropZone from "./Dicomdropzone";
import PatientInfoForm from "./Patientinfoform";
import UploadSuccessModal from "./Uploadsuccessmodal";
import { createStudy, uploadDicomBatch } from "../../../services/studyService";
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
  const navigate    = useNavigate();
  const { refresh } = useStudies();

  const [isMobile, setIsMobile]               = useState(window.innerWidth < 768);
  const [files, setFiles]                     = useState<UploadedFile[]>([]);
  const [form, setForm]                       = useState<PatientForm>(EMPTY_FORM);
  const [errors, setErrors]                   = useState<Record<string, string>>({});
  const [submitted, setSubmitted]             = useState(false);
  const [rawFiles, setRawFiles]               = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [uploadStage, setUploadStage]         = useState<string>("");
  const [uploadError, setUploadError]         = useState<string>("");
  const [filesExpanded, setFilesExpanded]     = useState(true);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [extractionMsg, setExtractionMsg]     = useState("");

  const isSubmittingRef = useRef(false);
  const formRef         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── ZIP extraction ─────────────────────────────────────────────────────────
  const extractZip = async (zipFile: File): Promise<File[]> => {
    // Dynamic import keeps jszip out of the initial bundle
    const { default: JSZip } = await import("jszip");
    const zip = await new JSZip().loadAsync(zipFile);
    const extracted: File[] = [];

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const name = path.split("/").pop() ?? path;
      // Skip macOS metadata and hidden entries
      if (name.startsWith(".") || path.includes("__MACOSX")) continue;
      const blob = await entry.async("blob");
      extracted.push(new File([blob], name, { type: "application/dicom" }));
    }
    return extracted;
  };

  // ── File handling ──────────────────────────────────────────────────────────
  const addFiles = async (incoming: File[]) => {
    const zips   = incoming.filter(f => f.name.toLowerCase().endsWith(".zip"));
    let allFiles = incoming.filter(f => !f.name.toLowerCase().endsWith(".zip"));

    // ── Step 1: expand ZIPs ──────────────────────────────────────────────────
    if (zips.length > 0) {
      setIsExtractingZip(true);
      setExtractionMsg(
        zips.length === 1
          ? `Extracting ${zips[0].name}…`
          : `Extracting ${zips.length} ZIP archives…`,
      );
      try {
        for (const zip of zips) {
          const out = await extractZip(zip);
          setExtractionMsg(
            `✓  Extracted ${out.length} file${out.length !== 1 ? "s" : ""} from ${zip.name}`,
          );
          allFiles = [...allFiles, ...out];
        }
      } catch (err) {
        console.error("ZIP extraction failed:", err);
        setExtractionMsg("⚠  Extraction failed — check browser console");
      } finally {
        // Hold the banner briefly so the user can read the result
        await new Promise<void>(r => setTimeout(r, 800));
        setIsExtractingZip(false);
      }
    }

    // ── Step 2: deduplicate & queue ──────────────────────────────────────────
    // Using a functional update so `prevRaw` is always the latest state,
    // even if addFiles is called concurrently (e.g. multiple rapid drops).
    setRawFiles(prevRaw => {
      const existingKeys = new Set(prevRaw.map(fileKey));
      const fresh = allFiles.filter(f => !existingKeys.has(fileKey(f)));
      if (fresh.length === 0) return prevRaw;

      const startIdx   = prevRaw.length;
      const totalAfter = startIdx + fresh.length;

      // Auto-collapse so the form is reachable without scrolling
      if (totalAfter > AUTO_COLLAPSE_AT) setFilesExpanded(false);

      const mapped: UploadedFile[] = fresh.map(f => ({
        name: f.name,
        size: formatSize(f.size),
        progress: 0,
        done: false,
      }));

      setFiles(pf => [...pf, ...mapped]);

      // Animate per-file scan progress
      mapped.forEach((_, i) => {
        const idx = startIdx + i;
        let prog  = 0;
        const iv  = setInterval(() => {
          prog += Math.random() * 20 + 10;
          if (prog >= 100) {
            clearInterval(iv);
            setFiles(pf =>
              pf.map((f, fi) => fi === idx ? { ...f, progress: 100, done: true } : f),
            );
          } else {
            setFiles(pf =>
              pf.map((f, fi) => fi === idx ? { ...f, progress: Math.round(prog) } : f),
            );
          }
        }, 300);
      });

      return [...prevRaw, ...fresh];
    });
  };

  const removeFile = (idx: number) => {
    setFiles(pf   => pf.filter((_, i) => i !== idx));
    setRawFiles(pr => pr.filter((_, i) => i !== idx));
  };

  // ── Form handling ──────────────────────────────────────────────────────────
  const patchForm = (patch: Partial<PatientForm>) =>
    setForm(p => ({ ...p, ...patch }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.patientName) e.patientName = "Required";
    if (!form.patientId)   e.patientId   = "Required";
    if (!form.modality)    e.modality    = "Required";
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
        patient_name:     form.patientName,
        patient_id:       form.patientId,
        date_of_birth:    form.dob             || undefined,
        sex:              form.sex             || undefined,
        modality:         form.modality,
        description:      form.description,
        referring_doctor: form.referringDoctor || undefined,
        institution:      form.institution     || undefined,
        clinical_history: form.clinicalHistory || undefined,
        is_urgent:        form.urgent,
      });

      // 2. Bundle all files into one ZIP and send a single request
      if (rawFiles.length > 0) {
        setUploadStage(
          rawFiles.length === 1
            ? "Uploading 1 DICOM file…"
            : `Bundling ${rawFiles.length} DICOM files & uploading…`,
        );
        await uploadDicomBatch(study.id, rawFiles);
      }

      // 3. Await refresh BEFORE showing the modal so the worklist is already
      //    current when the user clicks "View in Worklist".
      //    Previously `void refresh()` was fire-and-forget, causing a stale list.
      setUploadStage("Refreshing worklist…");
      await refresh();

      // 4. Show success — this unmounts the form, preventing a second submit
      setSubmitted(true);

    } catch (err) {
      console.error("Upload failed:", err);
      setUploadError(
        err instanceof Error ? err.message : "Upload failed — please try again.",
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

  // ── Derived values ─────────────────────────────────────────────────────────
  const doneCount  = files.filter(f => f.done).length;
  const overallPct = files.length === 0
    ? 0
    : Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length);
  const hasFiles = files.length > 0;
  const pad      = isMobile ? "16px" : "32px";

  return (
    <div style={{ padding: pad, background: "#F8FAFF", minHeight: "100%", boxSizing: "border-box" }}>

      {/* Single keyframes definition shared by all spinners */}
      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: isMobile ? "20px" : "24px", fontWeight: 700, color: "#111827", margin: 0 }}>
          Upload Study
        </h2>
        <p style={{ fontSize: "13px", color: "#6b7280", margin: "4px 0 0 0" }}>
          Upload to the PACS server
        </p>
      </div>

      {/* ── Auto-arrival info banner ─────────────────────────────────────────── */}
      <div style={{ background: "#EBF3FF", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "14px 16px", marginBottom: "24px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <AlertTriangle size={16} color="#1A73E8" style={{ flexShrink: 0, marginTop: "1px" }} />
        <div style={{ fontSize: "13px", color: "#1e40af", lineHeight: 1.5 }}>
          <strong>How studies arrive automatically:</strong> CT, MRI, and X-ray machines can be configured to send images directly to this PACS server. No manual upload needed — the study appears in the worklist immediately.
        </div>
      </div>

      {/* ── ZIP extraction banner ────────────────────────────────────────────── */}
      {isExtractingZip && (
        <div style={{ background: "#F0FDF4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "14px 16px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
          <FileArchive size={16} color="#16a34a" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "#166534", fontWeight: 600 }}>{extractionMsg}</span>
        </div>
      )}

      {/* ── Upload in-progress banner ────────────────────────────────────────── */}
      {isSubmitting && (
        <div style={{ background: "#FFF7ED", border: "1px solid #fed7aa", borderRadius: "12px", padding: "14px 16px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "16px", height: "16px", border: "2px solid #fed7aa", borderTopColor: "#EA580C", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "#9a3412", fontWeight: 600 }}>{uploadStage}</span>
        </div>
      )}

      {/* ── Upload error banner ──────────────────────────────────────────────── */}
      {uploadError && (
        <div style={{ background: "#FEF2F2", border: "1px solid #fecaca", borderRadius: "12px", padding: "14px 16px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
          <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "#991b1b", fontWeight: 600 }}>{uploadError}</span>
        </div>
      )}

      {/* ── Two-column layout ────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "20px" }}>

        {/* ─── Left column ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* ── File section ──────────────────────────────────────────────────── */}
          <div>
            {/* Collapse / expand toggle — appears once files are queued */}
            {hasFiles && (
              <div
                role="button"
                aria-expanded={filesExpanded}
                onClick={() => setFilesExpanded(v => !v)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderBottom: filesExpanded ? "none" : undefined,
                  borderRadius: filesExpanded ? "12px 12px 0 0" : "12px",
                  padding: "10px 14px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                {/* Left: file count + scan status */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Files size={15} color="#6b7280" />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                    {files.length} file{files.length !== 1 ? "s" : ""}
                    {" · "}
                    {doneCount < files.length
                      ? `scanning (${doneCount} / ${files.length})`
                      : "all ready"}
                  </span>
                </div>

                {/* Right: mini progress bar when collapsed + chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {!filesExpanded && (
                    <>
                      <div style={{ width: "72px", height: "4px", background: "#f3f4f6", borderRadius: "2px" }}>
                        <div style={{
                          width: `${overallPct}%`, height: "100%",
                          background: "#1A73E8", borderRadius: "2px",
                          transition: "width 0.3s",
                        }} />
                      </div>
                      <span style={{ fontSize: "11px", color: "#6b7280", minWidth: "28px", textAlign: "right" }}>
                        {overallPct}%
                      </span>
                    </>
                  )}
                  {filesExpanded
                    ? <ChevronUp   size={15} color="#6b7280" />
                    : <ChevronDown size={15} color="#6b7280" />}
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
                  marginTop: "6px", width: "100%", padding: "9px",
                  background: "transparent", border: "1.5px dashed #d1d5db",
                  borderRadius: "10px", color: "#6b7280", fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                + Expand to add more files
              </button>
            )}
          </div>

          {/* ── Jump-to-form shortcut ────────────────────────────────────────── */}
          {hasFiles && (
            <button
              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
              style={{
                padding: "9px 16px", background: "#EBF3FF",
                border: "1px solid #bfdbfe", borderRadius: "10px",
                color: "#1A73E8", fontSize: "13px", fontWeight: 600,
                cursor: "pointer", width: "100%",
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
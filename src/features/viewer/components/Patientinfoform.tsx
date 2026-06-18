import { AlertTriangle } from "lucide-react";
import { cardStyle, labelStyle, inputStyle, type PatientForm } from "../types";

interface Props {
  form: PatientForm;
  errors: Record<string, string>;
  isMobile: boolean;
  isSubmitting: boolean;
  onChange: (patch: Partial<PatientForm>) => void;
  onSubmit: () => void;
}

export default function PatientInfoForm({
  form,
  errors,
  isMobile,
  onChange,
  onSubmit,
  isSubmitting,
}: Props) {
  const grid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
    gap: "12px",
  };

  return (
    <div style={cardStyle}>
      <div style={{ padding: "16px", borderBottom: "1px solid #f3f4f6" }}>
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#111827" }}>
          Patient Information
        </h3>
      </div>

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Row 1: Name + ID */}
        <div style={grid2}>
          <div>
            <label style={labelStyle}>Patient Name *</label>
            <input
              value={form.patientName}
              onChange={(e) => onChange({ patientName: e.target.value })}
              placeholder="Full name"
              disabled={isSubmitting} // changed: lock fields while uploading
              style={{ ...inputStyle(!!errors.patientName), opacity: isSubmitting ? 0.6 : 1 }}
            />
            {errors.patientName && (
              <span style={{ fontSize: "11px", color: "#dc2626" }}>{errors.patientName}</span>
            )}
          </div>
          <div>
            <label style={labelStyle}>Patient ID *</label>
            <input
              value={form.patientId}
              onChange={(e) => onChange({ patientId: e.target.value })}
              placeholder="e.g. KNH-001"
              disabled={isSubmitting} // changed
              style={{ ...inputStyle(!!errors.patientId), opacity: isSubmitting ? 0.6 : 1 }}
            />
            {errors.patientId && (
              <span style={{ fontSize: "11px", color: "#dc2626" }}>{errors.patientId}</span>
            )}
          </div>
        </div>

        {/* Row 2: DOB + Sex */}
        <div style={grid2}>
          <div>
            <label style={labelStyle}>Date of Birth</label>
            <input
              type="date"
              value={form.dob}
              onChange={(e) => onChange({ dob: e.target.value })}
              disabled={isSubmitting} // changed
              style={{ ...inputStyle(), opacity: isSubmitting ? 0.6 : 1 }}
            />
          </div>
          <div>
            <label style={labelStyle}>Sex</label>
            <select
              value={form.sex}
              onChange={(e) => onChange({ sex: e.target.value })}
              disabled={isSubmitting} // changed
              style={{ ...inputStyle(), opacity: isSubmitting ? 0.6 : 1 }}
            >
              <option value="">Select</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {/* Row 3: Modality + Description */}
        <div style={grid2}>
          <div>
            <label style={labelStyle}>Modality *</label>
            <select
              value={form.modality}
              onChange={(e) => onChange({ modality: e.target.value })}
              disabled={isSubmitting} // changed
              style={{ ...inputStyle(!!errors.modality), opacity: isSubmitting ? 0.6 : 1 }}
            >
              <option value="">Select</option>
              {["CT", "MRI", "X-RAY", "ULTRASOUND", "PET", "MAMMOGRAPHY"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            {errors.modality && (
              <span style={{ fontSize: "11px", color: "#dc2626" }}>{errors.modality}</span>
            )}
          </div>
          <div>
            <label style={labelStyle}>Study Description *</label>
            <input
              value={form.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="e.g. CT Brain Plain"
              disabled={isSubmitting} // changed
              style={{ ...inputStyle(!!errors.description), opacity: isSubmitting ? 0.6 : 1 }}
            />
            {errors.description && (
              <span style={{ fontSize: "11px", color: "#dc2626" }}>{errors.description}</span>
            )}
          </div>
        </div>

        {/* Row 4: Referring doctor + Institution */}
        <div style={grid2}>
          <div>
            <label style={labelStyle}>Referring Doctor</label>
            <input
              value={form.referringDoctor}
              onChange={(e) => onChange({ referringDoctor: e.target.value })}
              placeholder="Dr. Name"
              disabled={isSubmitting} // changed
              style={{ ...inputStyle(), opacity: isSubmitting ? 0.6 : 1 }}
            />
          </div>
          <div>
            <label style={labelStyle}>Institution</label>
            <select
              value={form.institution}
              onChange={(e) => onChange({ institution: e.target.value })}
              disabled={isSubmitting} // changed
              style={{ ...inputStyle(), opacity: isSubmitting ? 0.6 : 1 }}
            >
              <option value="">Select</option>
              {[
                "Kenyatta National Hospital",
                "Aga Khan Hospital Nairobi",
                "Nairobi Imaging Centre",
                "Mater Hospital",
              ].map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Clinical history */}
        <div>
          <label style={labelStyle}>Clinical History</label>
          <textarea
            value={form.clinicalHistory}
            onChange={(e) => onChange({ clinicalHistory: e.target.value })}
            placeholder="Relevant clinical history..."
            rows={3}
            disabled={isSubmitting} // changed
            style={{ ...inputStyle(), resize: "vertical", opacity: isSubmitting ? 0.6 : 1 }}
          />
        </div>

        {/* Urgent toggle — disabled while uploading */}
        <div
          onClick={() => { if (!isSubmitting) onChange({ urgent: !form.urgent }); }} // changed
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderRadius: "12px",
            cursor: isSubmitting ? "not-allowed" : "pointer", // changed
            opacity: isSubmitting ? 0.6 : 1, // changed
            background: form.urgent ? "#fef2f2" : "#f9fafb",
            border: `1px solid ${form.urgent ? "#fca5a5" : "#e5e7eb"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={16} color={form.urgent ? "#ef4444" : "#9ca3af"} />
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: form.urgent ? "#dc2626" : "#374151" }}>
                Mark as STAT / Urgent
              </div>
              {form.urgent && (
                <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "2px" }}>
                  This study will be prioritised in the worklist
                </div>
              )}
            </div>
          </div>
          {/* Toggle pill */}
          <div
            style={{
              width: "40px",
              height: "22px",
              borderRadius: "11px",
              background: form.urgent ? "#ef4444" : "#d1d5db",
              position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "#fff",
                position: "absolute",
                top: "2px",
                left: form.urgent ? "20px" : "2px",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </div>
        </div>

        {/* Submit button — changed: disabled + spinner + label swap while uploading */}
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: "12px",
            border: "none",
            background: isSubmitting ? "#93c5fd" : "#1A73E8", // changed: muted blue while busy
            color: "#fff",
            fontSize: "15px",
            fontWeight: 600,
            cursor: isSubmitting ? "not-allowed" : "pointer", // changed
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "background 0.2s",
          }}
        >
          {/* changed: spinner + contextual label replaces static text while uploading */}
          {isSubmitting && (
            <>
              <div
                style={{
                  width: "15px",
                  height: "15px",
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "btn-spin 0.8s linear infinite",
                  flexShrink: 0,
                }}
              />
              <style>{`@keyframes btn-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
            </>
          )}
          {isSubmitting ? "Uploading…" : "Upload to PACS"}
        </button>
      </div>
    </div>
  );
}
import { CheckCircle } from "lucide-react";
import type { PatientForm } from "../types";


interface Props {
  form: PatientForm;
  onViewWorklist: () => void;
  onUploadAnother: () => void;
}

export default function UploadSuccessModal({
  form,
  onViewWorklist,
  onUploadAnother,
}: Props) {
  return (
    <div
      style={{
        padding: "32px",
        background: "#F8FAFF",
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "20px",
          padding: "48px 32px",
          textAlign: "center",
          maxWidth: "440px",
          width: "100%",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "#f0fdf4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <CheckCircle size={32} color="#16a34a" />
        </div>

        <h3
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "#111827",
            margin: "0 0 8px 0",
          }}
        >
          Study Uploaded Successfully
        </h3>
        <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 4px 0" }}>
          {form.patientName} · {form.modality}
        </p>
        <p style={{ fontSize: "12px", color: "#9ca3af", margin: "0 0 32px 0" }}>
          {new Date().toLocaleString()}
        </p>

        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={onViewWorklist}
            style={{
              padding: "11px 24px",
              borderRadius: "10px",
              border: "none",
              background: "#1A73E8",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            View in Worklist
          </button>
          <button
            onClick={onUploadAnother}
            style={{
              padding: "11px 24px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#374151",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Upload Another
          </button>
        </div>
      </div>
    </div>
  );
}
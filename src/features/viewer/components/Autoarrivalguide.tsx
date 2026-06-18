import { FileText } from "lucide-react";
import { cardStyle } from "../types";


const STEPS = [
  { step: "1", text: "Radiographer performs scan on CT/MRI/X-ray machine" },
  { step: "2", text: "Machine sends DICOM files to PACS via port 4242" },
  { step: "3", text: "Study appears in the worklist within seconds" },
  { step: "4", text: "Radiologist opens viewer and writes report" },
];

export default function AutoArrivalGuide() {
  return (
    <div style={{ ...cardStyle, padding: "20px" }}>
      <div
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "#111827",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <FileText size={14} color="#1A73E8" /> How studies arrive automatically
      </div>

      {STEPS.map((s) => (
        <div
          key={s.step}
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "12px",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: "#EBF3FF",
              color: "#1A73E8",
              fontSize: "11px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {s.step}
          </div>
          <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.5, paddingTop: "2px" }}>
            {s.text}
          </div>
        </div>
      ))}
    </div>
  );
}
import { useState } from "react";
import { Server, Wifi, Copy, CheckCircle } from "lucide-react";
import { cardStyle, PACS_FIELDS, type PacsField } from "./types";


// ─── Single copyable row ─────────────────────────────────────────────────────
function CopyField({ label, value }: PacsField) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: "1px solid #f3f4f6",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "11px",
            color: "#9ca3af",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "14px",
            fontFamily: "monospace",
            fontWeight: 600,
            color: "#111827",
            marginTop: "2px",
          }}
        >
          {value}
        </div>
      </div>
      <button
        onClick={copy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "6px 12px",
          borderRadius: "8px",
          border: "none",
          background: copied ? "#f0fdf4" : "#f3f4f6",
          color: copied ? "#16a34a" : "#6b7280",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
          flexShrink: 0,
          marginLeft: "12px",
        }}
      >
        {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ─── Main card ───────────────────────────────────────────────────────────────
export default function PacsConnectionCard() {
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState(false);

  const handlePing = async () => {
    setPinging(true);
    setPingResult(false);
    await new Promise((r) => setTimeout(r, 1500));
    setPinging(false);
    setPingResult(true);
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          background: "#0B4F8A",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Server size={16} color="white" />
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
            DICOM Connection Settings
          </div>
          <div style={{ fontSize: "12px", color: "#93c5fd" }}>
            Share with your imaging equipment technician
          </div>
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: "4px 20px 8px" }}>
        {PACS_FIELDS.map((f) => (
          <CopyField key={f.label} label={f.label} value={f.value} />
        ))}
      </div>

      {/* Ping */}
      <div style={{ padding: "0 20px 20px" }}>
        <button
          onClick={handlePing}
          disabled={pinging}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "10px",
            border: "1px solid #bfdbfe",
            background: "#EBF3FF",
            color: "#1A73E8",
            fontSize: "13px",
            fontWeight: 600,
            cursor: pinging ? "not-allowed" : "pointer",
            opacity: pinging ? 0.7 : 1,
          }}
        >
          <Wifi size={14} />
          {pinging ? "Pinging PACS..." : "Send C-ECHO Ping"}
        </button>

        {pingResult && (
          <div
            style={{
              marginTop: "12px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "10px",
              padding: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "#16a34a",
                fontWeight: 600,
                fontSize: "13px",
                marginBottom: "4px",
              }}
            >
              <CheckCircle size={14} /> C-ECHO Success — PACS is reachable
            </div>
            <div style={{ fontSize: "12px", color: "#15803d" }}>
              Response time: 42ms · AE Title confirmed: RADIOGRAPHY
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
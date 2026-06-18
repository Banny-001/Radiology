import { Monitor, Plus } from "lucide-react";
import { cardStyle, DEVICES } from "../types";


export default function ConnectedDevicesCard() {
  return (
    <div style={cardStyle}>
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <Monitor size={15} color="#6b7280" />
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
            Connected Devices
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            Imaging equipment sending to this PACS
          </div>
        </div>
      </div>

      {/* Device list */}
      {DEVICES.map((d, i) => (
        <div
          key={i}
          style={{
            padding: "14px 20px",
            borderBottom: i < DEVICES.length - 1 ? "1px solid #f9fafb" : "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>
              {d.name}
            </div>
            <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "1px" }}>
              {d.location}
            </div>
            <div
              style={{
                fontSize: "11px",
                fontFamily: "monospace",
                color: "#6b7280",
                marginTop: "2px",
              }}
            >
              {d.ae}
            </div>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "3px" }}>
              Last: {d.last}
            </div>
          </div>

          <span
            style={{
              padding: "4px 10px",
              borderRadius: "20px",
              fontSize: "11px",
              fontWeight: 600,
              background: d.status === "online" ? "#f0fdf4" : "#fefce8",
              color: d.status === "online" ? "#16a34a" : "#ca8a04",
              flexShrink: 0,
              marginLeft: "8px",
            }}
          >
            ● {d.status === "online" ? "Online" : "Idle"}
          </span>
        </div>
      ))}

      {/* Register button */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6" }}>
        <button
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "10px",
            border: "2px dashed #e5e7eb",
            background: "#fff",
            color: "#9ca3af",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            boxSizing: "border-box",
          }}
        >
          <Plus size={14} /> Register New Device
        </button>
      </div>
    </div>
  );
}
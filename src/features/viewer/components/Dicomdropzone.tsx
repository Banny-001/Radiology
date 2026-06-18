import { useState } from "react";
import { Upload, File, X } from "lucide-react";
import { cardStyle, type UploadedFile } from "../types";

interface Props {
  files: UploadedFile[];
  onFilesAdded: (files: File[]) => void;
  onRemove: (idx: number) => void;
}

export default function DicomDropZone({
  files,
  onFilesAdded,
  onRemove,
}: Props) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFilesAdded(Array.from(e.dataTransfer.files));
  };

  return (
    <div style={cardStyle}>
      <div style={{ padding: "16px", borderBottom: "1px solid #f3f4f6" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "15px",
            fontWeight: 700,
            color: "#111827",
          }}
        >
          DICOM Files
        </h3>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
        style={{
          margin: "16px",
          border: `2px dashed ${dragging ? "#1A73E8" : "#e5e7eb"}`,
          borderRadius: "12px",
          padding: "32px 16px",
          textAlign: "center",
          background: dragging ? "#EBF3FF" : "#fafafa",
          transition: "all 0.2s ease",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "#EBF3FF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 12px",
          }}
        >
          <Upload size={22} color="#1A73E8" />
        </div>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "#111827",
            marginBottom: "4px",
          }}
        >
          Drop DICOM files here
        </div>
        <div
          style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "12px" }}
        >
          Any file type supported
        </div>
        <button
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: "8px 20px",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#374151",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Browse files
        </button>
        {/* <input
          id="file-input"
          type="file"
          multiple
          // accept=".dcm"
          onChange={(e) => e.target.files && onFilesAdded(Array.from(e.target.files))}
          style={{ display: "none" }}
        /> */}
        <input
          id="file-input"
          type="file"
          multiple
          onChange={(e) =>
            e.target.files && onFilesAdded(Array.from(e.target.files))
          }
          style={{ display: "none" }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ padding: "0 16px 16px" }}>
          {files.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px",
                background: "#f9fafb",
                borderRadius: "10px",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  background: "#EBF3FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <File size={16} color="#1A73E8" />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#111827",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "4px",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: "4px",
                      borderRadius: "2px",
                      background: "#e5e7eb",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: "2px",
                        background: f.done ? "#16a34a" : "#1A73E8",
                        width: `${f.progress}%`,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      color: f.done ? "#16a34a" : "#6b7280",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {f.done ? "✓" : `${f.progress}%`}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    marginTop: "1px",
                  }}
                >
                  {f.size}
                </div>
              </div>

              <button
                onClick={() => onRemove(i)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#9ca3af",
                  padding: "4px",
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

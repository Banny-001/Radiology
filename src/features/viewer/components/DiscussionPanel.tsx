import { Send } from "lucide-react";
import { ROLE_COLORS } from "./viewerConstants";
import type { useStudies } from "../../../context/StudyContext";

export function DiscussionPanel({
  study,
  comment,
  setComment,
  onPost,
  commentEndRef,
}: {
  study: ReturnType<typeof useStudies>["studies"][0];
  comment: string;
  setComment: (v: string) => void;
  onPost: () => void;
  commentEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ROLE_LABELS: Record<string, string> = {
    radiologist: "Radiologist",
    radiographer: "Radiographer",
    referring_doctor: "Referring Doctor",
    admin: "Admin",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {study.comments.length === 0 && (
        <div
          style={{
            textAlign: "center",
            color: "#4b5563",
            fontSize: "13px",
            padding: "20px 0",
          }}
        >
          No comments yet. Start the discussion.
        </div>
      )}

      {study.comments.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: "8px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: ROLE_COLORS[c.authorRole] ?? "#555",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {c.authorName
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexWrap: "wrap",
                marginBottom: "3px",
              }}
            >
              <span
                style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}
              >
                {c.authorName}
              </span>
              <span
                style={{
                  fontSize: "9px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background: (ROLE_COLORS[c.authorRole] ?? "#555") + "33",
                  color: "#fff",
                  fontWeight: 600,
                }}
              >
                {ROLE_LABELS[c.authorRole]}
              </span>
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "#4b5563",
                marginBottom: "4px",
              }}
            >
              {new Date(c.timestamp).toLocaleTimeString()}
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#d1d5db",
                background: "rgba(255,255,255,0.05)",
                borderRadius: "8px",
                padding: "8px 10px",
                lineHeight: 1.5,
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {c.message}
            </div>
          </div>
        </div>
      ))}
      <div ref={commentEndRef} />

      {/* Comment input */}
      <div style={{ marginTop: "8px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onPost();
              }
            }}
            placeholder="Add a comment..."
            rows={2}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              padding: "8px 10px",
              fontSize: "13px",
              color: "#e5e7eb",
              outline: "none",
              resize: "none",
            }}
          />
          <button
            onClick={onPost}
            disabled={!comment.trim()}
            style={{
              padding: "8px 10px",
              borderRadius: "8px",
              border: "none",
              background: comment.trim() ? "#1A73E8" : "#1a1a1a",
              color: comment.trim() ? "#fff" : "#4b5563",
              cursor: comment.trim() ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Send size={14} />
          </button>
        </div>
        <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "4px" }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
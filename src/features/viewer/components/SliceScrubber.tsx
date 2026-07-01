// SliceScrubber.tsx
//
// A vertical scrollbar for the slice stack: a draggable handle over a small
// silhouette of the anatomy (built by useLocalizerStrip) so the user can see
// roughly where the current slice sits in the stack, and can click/drag
// anywhere on the bar to jump straight there — a much smoother, more direct
// way to navigate than repeated wheel/keyboard steps.
import { useEffect, useRef, useState } from "react";
import type { LocalizerStrip } from "./useLocalizerStrip";

interface SliceScrubberProps {
  currentSlice: number;
  maxSlices: number;
  onScrub: (slice: number) => void;
  strip: LocalizerStrip | null;
  /** Distance from the right edge of the viewport (lets callers keep clear
   * of other right-docked overlays, e.g. the desktop zoom/brightness panel). */
  rightOffset?: string;
}

export default function SliceScrubber({
  currentSlice,
  maxSlices,
  onScrub,
  strip,
  rightOffset = "10px",
}: SliceScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !strip) return;
    canvas.width = strip.width;
    canvas.height = strip.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(strip.width, strip.height);
    for (let p = 0, i = 0; p < strip.pixels.length; p++, i += 4) {
      const v = strip.pixels[p];
      imageData.data[i] = v;
      imageData.data[i + 1] = v;
      imageData.data[i + 2] = v;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [strip]);

  if (maxSlices <= 1) return null;

  const sliceFromClientY = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return currentSlice;
    const frac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.round(frac * (maxSlices - 1)) + 1;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onScrub(sliceFromClientY(e.clientY));
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    onScrub(sliceFromClientY(e.clientY));
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const fraction = (currentSlice - 1) / (maxSlices - 1);

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: "absolute",
        top: "8%",
        bottom: "8%",
        right: rightOffset,
        width: "26px",
        borderRadius: "13px",
        background: "rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,255,255,0.12)",
        overflow: "hidden",
        cursor: dragging ? "grabbing" : "ns-resize",
        touchAction: "none",
        zIndex: 20,
      }}
    >
      {strip && (
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0.55,
            filter: "contrast(1.15)",
            pointerEvents: "none",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${fraction * 100}%`,
          height: "3px",
          background: "#1A73E8",
          boxShadow: "0 0 6px rgba(26,115,232,0.9)",
          transform: "translateY(-1.5px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: `${fraction * 100}%`,
          transform: "translate(-50%, -50%)",
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: "#1A73E8",
          border: "2px solid #fff",
          pointerEvents: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "34px",
          top: `${fraction * 100}%`,
          transform: "translateY(-50%)",
          fontSize: "9px",
          fontFamily: "monospace",
          color: "#fff",
          background: "rgba(0,0,0,0.7)",
          padding: "2px 5px",
          borderRadius: "4px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {currentSlice}/{maxSlices}
      </div>
    </div>
  );
}

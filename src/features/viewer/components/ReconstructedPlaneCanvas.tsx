// ReconstructedPlaneCanvas.tsx
//
// Draws a reconstructed coronal/sagittal PlaneImage (see reconstructPlane.ts)
// onto a <canvas>, applying the same brightness/invert/zoom/rotation/flip
// treatment ViewerPage applies to the axial JPEG preview, so all three MPR
// panes look and feel consistent.
import { useEffect, useRef } from "react";
import type { PlaneImage } from "./reconstructPlane";

interface ReconstructedPlaneCanvasProps {
  plane: PlaneImage | null;
  brightness: number;
  isInverted: boolean;
  zoom: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  offsetX: number;
  offsetY: number;
}

export default function ReconstructedPlaneCanvas({
  plane,
  brightness,
  isInverted,
  zoom,
  rotation,
  flipH,
  flipV,
  offsetX,
  offsetY,
}: ReconstructedPlaneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plane) return;
    canvas.width = plane.width;
    canvas.height = plane.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(plane.width, plane.height);
    for (let p = 0, i = 0; p < plane.pixels.length; p++, i += 4) {
      const v = plane.pixels[p];
      imageData.data[i] = v;
      imageData.data[i + 1] = v;
      imageData.data[i + 2] = v;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [plane]);

  if (!plane) {
    return <div style={{ width: "100%", height: "100%", background: "#000" }} />;
  }

  const scaleX = zoom * (flipH ? -1 : 1);
  const scaleY = zoom * (flipV ? -1 : 1);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        overflow: "hidden",
        filter: `brightness(${brightness}) ${isInverted ? "invert(1)" : ""}`,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          display: "block",
          // Unlike the true axial preview (kept pixel-sharp on purpose),
          // this canvas is a coarse reconstruction — often just a few
          // hundred pixels along the depth axis — stretched to fill the
          // panel. Smooth interpolation here looks like a proper
          // reformatted image instead of a blown-up pixel grid.
          imageRendering: "auto",
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`,
          transformOrigin: "center center",
        }}
      />
    </div>
  );
}

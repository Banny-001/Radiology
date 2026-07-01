// MprPlaneImage.tsx
//
// Renders one coronal/sagittal/MIP cut that the backend already reconstructed
// and JPEG-encoded (see /mpr/coronal, /mpr/sagittal, /mpr/mip). This replaces
// ReconstructedPlaneCanvas + the client-side reconstructPlane.ts math — the
// browser no longer needs the raw voxel buffer at all, just a normal <img>,
// so brightness/invert are plain CSS filters and pan/zoom/rotate are plain
// CSS transforms, exactly like the axial DicomViewer image.
interface MprPlaneImageProps {
  src: string;
  brightness: number;
  isInverted: boolean;
  zoom: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  offsetX: number;
  offsetY: number;
}

export default function MprPlaneImage({
  src,
  brightness,
  isInverted,
  zoom,
  rotation,
  flipH,
  flipV,
  offsetX,
  offsetY,
}: MprPlaneImageProps) {
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
      <img
        // No key={src}: swapping src on the same <img> node lets the browser
        // paint the next slice in place instead of flashing/unmounting —
        // same reasoning as the axial DicomViewer image.
        src={src}
        alt=""
        draggable={false}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          display: "block",
          userSelect: "none",
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`,
          transformOrigin: "center center",
        }}
      />
    </div>
  );
}

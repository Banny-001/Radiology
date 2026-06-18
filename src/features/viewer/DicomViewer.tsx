import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { getDicomFileList } from "../../services/studyService";

declare global {
  interface Window {
    cornerstone: any;
  }
}

interface DicomViewerProps {
  dicomPath: string;
  studyId: string;
  brightness: number;
  zoom: number;
  activeTool: string;
  toolTrigger: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  isInverted: boolean;
  imageIndex?: number; // 0-based; controlled by parent
  offsetX?: number;
  offsetY?: number;
  activeSeries?: number;
  seriesCount?: number;
  onFileCountChange?: (count: number) => void;
}

export default function DicomViewer({
  studyId,
  zoom,
  rotation,
  flipH,
  flipV,
  isInverted,
  imageIndex = 0,
  offsetX = 0,
  offsetY = 0,
  activeSeries = 0,
  seriesCount = 1,
  onFileCountChange,
}: DicomViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileList, setFileList] = useState<string[]>([]);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Partition the flat file list into `seriesCount` contiguous chunks and
  // take the slice belonging to `activeSeries`. The backend gives us a single
  // list per study, so this is how we map the SERIES_MAP entries (AP/PA/
  // Lateral/Oblique for X-ray, Axial/Coronal/Sagittal for CT, etc.) onto
  // real files until the backend grows a proper series concept.
  const seriesFileList = (() => {
    if (fileList.length === 0 || seriesCount <= 1) return fileList;
    const chunkSize = Math.max(1, Math.floor(fileList.length / seriesCount));
    const start = activeSeries * chunkSize;
    // Last chunk grabs any remainder so no files are dropped.
    const end =
      activeSeries === seriesCount - 1 ? fileList.length : start + chunkSize;
    return fileList.slice(start, end);
  })();

  // Clamp the requested index to what's actually available in this series
  const safeIndex =
    seriesFileList.length > 0
      ? Math.max(0, Math.min(seriesFileList.length - 1, imageIndex))
      : 0;

  // ── Load DICOM file list from backend ────────────────────────────────
  useEffect(() => {
    const fetchFileList = async () => {
      try {
        const files = await getDicomFileList(studyId);
        setFileList(files);
        if (files.length === 0) {
          setError("No DICOM files found in this study");
        }
      } catch (err) {
        console.error("[DicomViewer] Failed to fetch file list:", err);
        setError(`Failed to load file list:\n${(err as Error).message}`);
      }
    };
    fetchFileList();
  }, [studyId]);

  // Report per-series count whenever the series chunk changes, so the parent's
  // scroll/cine bounds match what's actually being shown.
  useEffect(() => {
    onFileCountChange?.(seriesFileList.length);
  }, [seriesFileList.length, activeSeries]);

  // ── Initialize Cornerstone on mount ─────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (!window.cornerstone) {
      setError(
        "Cornerstone not initialized.\n\n" +
          "Make sure main.tsx has cornerstone initialization with WADO loader registration.",
      );
      return;
    }
    try {
      window.cornerstone.enable(containerRef.current);
    } catch (err) {
      setError(`Cornerstone initialization failed:\n${(err as Error).message}`);
    }
  }, []);

  // ── Load current DICOM image ───────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !window.cornerstone || seriesFileList.length === 0) return;

    const loadDicomImage = async () => {
      try {
        setLoading(true);
        setImageLoaded(false);
        const currentFile = seriesFileList[safeIndex];
        // const imageUrl = `http://localhost:8000/dicom/${studyId}/${encodeURIComponent(currentFile)}`;
        const imageUrl = `wadouri:/dicom/${studyId}/${encodeURIComponent(currentFile)}`;
        const image = await window.cornerstone.loadImage(imageUrl);
        window.cornerstone.displayImage(containerRef.current, image);
        setImageLoaded(true);
        setError(null);
      } catch (err) {
        console.error("[DicomViewer] Failed to load image:", err);
        setError(`Failed to load DICOM:\n${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    loadDicomImage();
  }, [safeIndex, seriesFileList, studyId]);

  // ── Apply transformations (zoom, rotation, flip, invert, translation) ──
  useEffect(() => {
    if (!containerRef.current || !window.cornerstone || !imageLoaded) return;
    try {
      const viewport = window.cornerstone.getViewport(containerRef.current);
      if (!viewport) return;
      viewport.scale = zoom;
      viewport.rotation = rotation;
      viewport.hflip = flipH;
      viewport.vflip = flipV;
      viewport.invert = isInverted;
      viewport.translation = { x: offsetX, y: offsetY };
      window.cornerstone.setViewport(containerRef.current, viewport);
    } catch (err) {
      console.error("[DicomViewer] Viewport update failed:", err);
    }
  }, [zoom, rotation, flipH, flipV, isInverted, offsetX, offsetY, imageLoaded]);

  if (error) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "12px",
          padding: "20px",
          color: "#ef4444",
          fontSize: "12px",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          overflow: "auto",
          textAlign: "center",
        }}
      >
        <AlertCircle size={24} style={{ flexShrink: 0 }} />
        <div style={{ lineHeight: 1.5 }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", background: "#000" }}
      />
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9ca3af",
            fontSize: "12px",
          }}
        >
          Loading DICOM...
        </div>
      )}
    </div>
  );
}
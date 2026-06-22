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
  imageIndex?: number;
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

  // Tracks whether cornerstone.enable() has successfully run on this element.
  // Using a ref (not state) so it doesn't trigger extra renders.
  const csEnabledRef = useRef(false);

  // ── Series partitioning ───────────────────────────────────────────────────
  // Partition the flat file list into `seriesCount` contiguous chunks and
  // take the slice belonging to `activeSeries`. The backend gives us a single
  // list per study, so this maps SERIES_MAP entries onto real files until
  // the backend grows a proper series concept.
  const seriesFileList = (() => {
    if (fileList.length === 0 || seriesCount <= 1) return fileList;
    const chunkSize = Math.max(1, Math.floor(fileList.length / seriesCount));
    const start = activeSeries * chunkSize;
    const end =
      activeSeries === seriesCount - 1 ? fileList.length : start + chunkSize;
    return fileList.slice(start, end);
  })();

  // Clamp the requested index to what's actually available in this series
  const safeIndex =
    seriesFileList.length > 0
      ? Math.max(0, Math.min(seriesFileList.length - 1, imageIndex))
      : 0;

  // ── Fetch file list ───────────────────────────────────────────────────────
  useEffect(() => {
    getDicomFileList(studyId)
      .then((files) => {
        setFileList(files);
        if (files.length === 0) {
          setError("No DICOM files found in this study");
        }
      })
      .catch((err) => {
        console.error("[DicomViewer] Failed to fetch file list:", err);
        setError(`Failed to load file list:\n${(err as Error).message}`);
      });
  }, [studyId]);

  // ── Report per-series file count to parent ────────────────────────────────
  useEffect(() => {
    onFileCountChange?.(seriesFileList.length);
  }, [seriesFileList.length, activeSeries]);

  // ── Initialize Cornerstone ONCE on mount ──────────────────────────────────
  // Disables on unmount so Cornerstone's internal element registry stays clean.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!window.cornerstone) {
      setError(
        "Cornerstone not initialized.\n\n" +
          "Make sure main.tsx has cornerstone initialization with WADO loader registration.",
      );
      return;
    }

    try {
      window.cornerstone.enable(el);
      csEnabledRef.current = true;
    } catch (err) {
      setError(`Cornerstone initialization failed:\n${(err as Error).message}`);
    }

    return () => {
      try {
        window.cornerstone.disable(el);
      } catch {
        // ignore — element may already be gone
      }
      csEnabledRef.current = false;
    };
  }, []);

  // ── Load current DICOM image ──────────────────────────────────────────────
  useEffect(() => {
    if (seriesFileList.length === 0) return;

    // Capture the DOM element synchronously — before any await — so we
    // never operate on a stale ref value after an async gap.
    const el = containerRef.current;
    if (!el || !window.cornerstone) return;

    // If cornerstone.enable() hasn't completed yet (both effects fire in the
    // same React flush on first render), retry once after a short delay.
    if (!csEnabledRef.current) {
      const timer = setTimeout(() => {
        if (!csEnabledRef.current || !containerRef.current) return;
        loadImage(containerRef.current);
      }, 50);
      return () => clearTimeout(timer);
    }

    loadImage(el);

    async function loadImage(element: HTMLDivElement) {
      try {
        setLoading(true);
        setImageLoaded(false);

        const currentFile = seriesFileList[safeIndex];
        const imageUrl = `wadouri:/dicom/${studyId}/${encodeURIComponent(currentFile)}`;
        const image = await window.cornerstone.loadImage(imageUrl);

        // Guard: component may have unmounted or Cornerstone disabled
        // during the async loadImage call — bail out rather than calling
        // displayImage on a detached element, which causes "element not enabled".
        if (!csEnabledRef.current) return;

        window.cornerstone.displayImage(element, image);
        setImageLoaded(true);
        setError(null);
      } catch (err) {
        console.error("[DicomViewer] Failed to load image:", err);
        setError(`Failed to load DICOM:\n${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    }
  }, [safeIndex, seriesFileList, studyId]);

  // ── Apply viewport transformations ───────────────────────────────────────
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

  // ── Error state ───────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
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
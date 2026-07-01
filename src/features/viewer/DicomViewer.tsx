// DicomViewer.tsx — JPEG preview version
// Uses /dicom/{filename}/preview endpoint (~30-60 KB) instead of raw DICOM (529 KB)
// No Cornerstone required. Pan/zoom/rotation handled by ViewerPage via CSS transforms.

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { getDicomFileList } from "../../services/studyService";

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
  onImageIndexChange?: (index: number) => void;
}

export default function DicomViewer({
  studyId,
  zoom = 1,
  rotation = 0,
  flipH = false,
  flipV = false,
  imageIndex = 0,
  offsetX = 0,
  offsetY = 0,
  activeSeries = 0,
  seriesCount = 1,
  onFileCountChange,
}: DicomViewerProps) {
  const [fileList, setFileList] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Track which study+series has already started prefetching so we don't repeat
  const prefetchKeyRef = useRef<string | null>(null);

  // ── Series partitioning ────────────────────────────────────────────────
  const seriesFileList = (() => {
    if (fileList.length === 0 || seriesCount <= 1) return fileList;
    const chunkSize = Math.max(1, Math.floor(fileList.length / seriesCount));
    const start = activeSeries * chunkSize;
    const end =
      activeSeries === seriesCount - 1 ? fileList.length : start + chunkSize;
    return fileList.slice(start, end);
  })();

  const safeIndex =
    seriesFileList.length > 0
      ? Math.max(0, Math.min(seriesFileList.length - 1, imageIndex))
      : 0;

  const currentFile = seriesFileList[safeIndex];

  // ── Fetch file list once ───────────────────────────────────────────────
  useEffect(() => {
    getDicomFileList(studyId)
      .then((files) => {
        setFileList(files);
        if (files.length === 0) setError("No DICOM files found in this study");
      })
      .catch((err) =>
        setError(`Failed to load file list:\n${(err as Error).message}`),
      );
  }, [studyId]);

  // ── Report per-series count to parent (drives slice counter in ViewerPage)
  useEffect(() => {
    onFileCountChange?.(seriesFileList.length);
  }, [seriesFileList.length, activeSeries]); // eslint-disable-line

  // ── Preload ±5 neighbours for instant adjacent-slice scrolling ─────────
  useEffect(() => {
    if (!currentFile || seriesFileList.length === 0) return;
    for (let d = -5; d <= 5; d++) {
      if (d === 0) continue;
      const idx = safeIndex + d;
      if (idx < 0 || idx >= seriesFileList.length) continue;
      const img = new Image();
      img.src = `/api/v1/studies/${studyId}/dicom/${encodeURIComponent(
        seriesFileList[idx],
      )}/preview`;
    }
  }, [safeIndex, currentFile, seriesFileList, studyId]);

  // ── Background prefetch: load all slices progressively ────────────────
  // Uses the browser's built-in HTTP cache (24 h max-age from the server).
  // Near slices load first so scrolling feels instant across the whole study.
  useEffect(() => {
    if (seriesFileList.length <= 1) return;

    const key = `${studyId}-${activeSeries}`;
    if (prefetchKeyRef.current === key) return; // already running for this series
    prefetchKeyRef.current = key;

    let cancelled = false;
    const WINDOW = 60; // load ±60 from current first, then the rest
    const total = seriesFileList.length;

    const nearby = Array.from({ length: total }, (_, i) => i)
      .filter((i) => i !== safeIndex && Math.abs(i - safeIndex) <= WINDOW)
      .sort((a, b) => Math.abs(a - safeIndex) - Math.abs(b - safeIndex));

    const far = Array.from({ length: total }, (_, i) => i)
      .filter((i) => i !== safeIndex && Math.abs(i - safeIndex) > WINDOW)
      .sort((a, b) => Math.abs(a - safeIndex) - Math.abs(b - safeIndex));

    const allIndices = [...nearby, ...far];
    const BATCH = 8; // more parallel requests OK now that files are ~30 KB each
    let i = 0;

    const loadBatch = () => {
      if (cancelled || i >= allIndices.length) return;
      const batch = allIndices.slice(i, i + BATCH);
      i += BATCH;
      let done = 0;

      batch.forEach((idx) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          done++;
          if (done === batch.length) {
            // Faster cadence for nearby slices, slower for far ones
            const delay = i <= nearby.length ? 10 : 60;
            setTimeout(loadBatch, delay);
          }
        };
        img.src = `/api/v1/studies/${studyId}/dicom/${encodeURIComponent(
          seriesFileList[idx],
        )}/preview`;
      });
    };

    loadBatch();
    return () => {
      cancelled = true;
    };
  }, [studyId, activeSeries, seriesFileList.length]); // eslint-disable-line

  // ── Error state ────────────────────────────────────────────────────────
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
          gap: 12,
          color: "#ef4444",
          fontSize: 12,
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          textAlign: "center",
          padding: 20,
        }}
      >
        <AlertCircle size={24} style={{ flexShrink: 0 }} />
        <div style={{ lineHeight: 1.5 }}>{error}</div>
      </div>
    );
  }

  // ── Loading / no file yet ──────────────────────────────────────────────
  if (!currentFile) {
    return <div style={{ width: "100%", height: "100%", background: "#000" }} />;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  // ViewerPage wraps this in a div with: filter: brightness(n) invert(0|1)
  // So we only handle geometric transforms here.
  const src = `/api/v1/studies/${studyId}/dicom/${encodeURIComponent(
    currentFile,
  )}/preview`;

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
      }}
    >
      <img
        // No `key={src}` here on purpose: keying by src forces React to
        // unmount/remount a brand-new <img> on every single slice change,
        // which is what made scrolling feel janky (a flash of nothing +
        // full relayout per slice). Keeping the same DOM node and just
        // swapping `src` lets the browser paint the next frame from cache
        // in place, which is what makes fast scrolling feel smooth.
        src={src}
        alt=""
        draggable={false}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          display: "block",
          userSelect: "none",
          // Geometric transforms driven by ViewerPage state
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`,
          transformOrigin: "center center",
          // Keep CT sharpness — no browser anti-aliasing
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
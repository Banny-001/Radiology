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
  /** Called when the user swipes vertically on mobile to change slice */
  onImageIndexChange?: (index: number) => void;
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
  onImageIndexChange,
}: DicomViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileList, setFileList] = useState<string[]>([]);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Local slice index: driven by the prop but can also be incremented by swipe
  const [localIndex, setLocalIndex] = useState(imageIndex);
  useEffect(() => {
    setLocalIndex(imageIndex);
  }, [imageIndex]);

  const csEnabledRef = useRef(false);

  // ── Refs that keep current values accessible inside non-reactive DOM handlers
  const localIndexRef = useRef(localIndex);
  const seriesFileListRef = useRef<string[]>([]);
  const onImageIndexChangeRef = useRef(onImageIndexChange);

  // Update every render — safe to do outside useEffect for refs
  localIndexRef.current = localIndex;
  onImageIndexChangeRef.current = onImageIndexChange;

  // ── Series partitioning ───────────────────────────────────────────────────
  const seriesFileList = (() => {
    if (fileList.length === 0 || seriesCount <= 1) return fileList;
    const chunkSize = Math.max(1, Math.floor(fileList.length / seriesCount));
    const start = activeSeries * chunkSize;
    const end =
      activeSeries === seriesCount - 1 ? fileList.length : start + chunkSize;
    return fileList.slice(start, end);
  })();

  // Keep the ref up-to-date so DOM handlers always see the current list
  seriesFileListRef.current = seriesFileList;

  const safeIndex =
    seriesFileList.length > 0
      ? Math.max(0, Math.min(seriesFileList.length - 1, localIndex))
      : 0;

  // ── Fetch file list ───────────────────────────────────────────────────────
  useEffect(() => {
    getDicomFileList(studyId)
      .then((files) => {
        setFileList(files);
        if (files.length === 0) setError("No DICOM files found in this study");
      })
      .catch((err) => {
        console.error("[DicomViewer] Failed to fetch file list:", err);
        setError(`Failed to load file list:\n${(err as Error).message}`);
      });
  }, [studyId]);

  // ── Report per-series file count to parent ────────────────────────────────
  useEffect(() => {
    onFileCountChange?.(seriesFileList.length);
  }, [seriesFileList.length, activeSeries]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initialize Cornerstone ONCE on mount ─────────────────────────────────
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
        /* element may already be gone */
      }
      csEnabledRef.current = false;
    };
  }, []);

  // ── Load / switch DICOM image ─────────────────────────────────────────────
  useEffect(() => {
    if (seriesFileList.length === 0) return;

    const el = containerRef.current;
    if (!el || !window.cornerstone) return;

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
        const imageUrl = `wadouri:/api/v1/studies/${studyId}/dicom/${encodeURIComponent(currentFile)}`;

        const image = await Promise.race([
          window.cornerstone.loadImage(imageUrl),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Image load timed out")), 30000),
          ),
        ]);

        if (!csEnabledRef.current) return;

        window.cornerstone.displayImage(element, image);

        // Apply DICOM W/L — without this, CT Hounsfield values render black
        try {
          const defaultVp = window.cornerstone.getDefaultViewportForImage(
            element,
            image,
          );
          if (defaultVp) {
            window.cornerstone.setViewport(element, defaultVp);
            window.cornerstone.updateImage(element);
          }
        } catch {
          /* ignore */
        }

        setImageLoaded(true);
        setError(null);
      } catch (err) {
        console.error("[DicomViewer] Failed to load image:", err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load DICOM:\n${msg}`);
      } finally {
        setLoading(false);
      }
    }
  }, [safeIndex, seriesFileList, studyId]);

  // ── Background prefetch ───────────────────────────────────────────────────
  //
  // Fires once after the first image is displayed. Loads all remaining slices
  // into Cornerstone's cache in the background so scrolling feels instant.
  //
  // Slices nearest the current index are fetched first so nearby navigation
  // is responsive even before the full series is cached.
  //
  // Uses loadAndCacheImage (not displayImage) so nothing on screen changes —
  // the user sees their current slice while the rest quietly pre-loads.
  useEffect(() => {
    if (!imageLoaded || seriesFileList.length <= 1) return;

    let cancelled = false;

    const backgroundPrefetch = async () => {
      // Sort all other indices by proximity to current — nearest first
      const indices = seriesFileList
        .map((_, i) => i)
        .filter((i) => i !== safeIndex)
        .sort((a, b) => Math.abs(a - safeIndex) - Math.abs(b - safeIndex));

      // Load in batches of 5 — enough to saturate HTTP/2 without overwhelming
      // a slower connection or blocking the main thread
      const BATCH = 5;
      for (let i = 0; i < indices.length; i += BATCH) {
        if (cancelled) break;
        const batch = indices.slice(i, i + BATCH);
        await Promise.all(
          batch.map((idx) => {
            const url = `wadouri:/api/v1/studies/${studyId}/dicom/${encodeURIComponent(seriesFileList[idx])}`;
            // loadAndCacheImage fetches + decodes into cache without displaying
            return window.cornerstone.loadAndCacheImage(url).catch(() => {});
          }),
        );
        // Yield to the main thread between batches so UI stays responsive
        await new Promise((r) => setTimeout(r, 30));
      }
    };

    backgroundPrefetch();
    return () => {
      cancelled = true;
    };
  }, [imageLoaded, studyId]); // eslint-disable-line react-hooks/exhaustive-deps
  // ↑ intentionally omits seriesFileList/safeIndex — we only want this to fire
  //   once after the first image loads, not re-run on every slice change

  // ── Apply viewport transformations ────────────────────────────────────────
  //
  // After setViewport(), updateImage() forces Cornerstone to re-render the full
  // canvas — including all Cornerstone Tools annotation overlays (length lines,
  // angle arcs, text labels). Without it, annotation labels can lag behind the
  // new zoom level and show stale positions or values.
  useEffect(() => {
    if (!containerRef.current || !window.cornerstone || !imageLoaded) return;
    const el = containerRef.current;
    try {
      const viewport = window.cornerstone.getViewport(el);
      if (!viewport) return;
      viewport.scale = zoom;
      viewport.rotation = rotation;
      viewport.hflip = flipH;
      viewport.vflip = flipV;
      viewport.invert = isInverted;
      viewport.translation = { x: offsetX, y: offsetY };
      window.cornerstone.setViewport(el, viewport);
      // ↑ setViewport triggers one render; updateImage forces a second pass that
      //   redraws all tool layers — this is what keeps measurement values current
      window.cornerstone.updateImage(el);
    } catch (err) {
      console.error("[DicomViewer] Viewport update failed:", err);
    }
  }, [zoom, rotation, flipH, flipV, isInverted, offsetX, offsetY, imageLoaded]);

  // ── Mobile touch handling ─────────────────────────────────────────────────
  //
  // React 17+ may attach touch handlers as passive, which blocks preventDefault()
  // and lets the browser hijack scroll. To guarantee non-passive semantics we add
  // listeners directly to the DOM element with { passive: false }.
  //
  // Three gestures handled:
  //   1. Single-finger pan   → forwarded as mousedown/mousemove/mouseup so the
  //                            active Cornerstone tool (pan, wwwl, length, etc.) reacts
  //   2. Two-finger pinch    → directly adjusts viewport.scale + calls updateImage
  //                            so annotations stay visible at the new zoom
  //   3. Vertical swipe      → changes the current slice (imageIndex) within the series
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // ── Touch state (local to this effect closure) ──────────────────────────
    let touchStartX: number | null = null;
    let touchStartY: number | null = null;
    let pinchDist: number | null = null;
    let isPinching = false;

    const getDistance = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const fireMouseEvent = (type: string, touch: Touch, buttons = 1) => {
      el.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons,
          clientX: touch.clientX,
          clientY: touch.clientY,
          screenX: touch.screenX,
          screenY: touch.screenY,
        }),
      );
    };

    // ── touchstart ──────────────────────────────────────────────────────────
    const onStart = (e: TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 2) {
        // Entering pinch — end any ongoing single-finger interaction first
        isPinching = true;
        pinchDist = getDistance(e.touches[0], e.touches[1]);
        el.dispatchEvent(
          new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            buttons: 0,
          }),
        );
      } else if (e.touches.length === 1) {
        isPinching = false;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        fireMouseEvent("mousedown", e.touches[0]);
      }
    };

    // ── touchmove ───────────────────────────────────────────────────────────
    const onMove = (e: TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 2 && pinchDist !== null) {
        // Pinch-to-zoom: scale viewport directly so Cornerstone tools see the change
        const newDist = getDistance(e.touches[0], e.touches[1]);
        const delta = newDist / pinchDist;
        pinchDist = newDist;

        if (!csEnabledRef.current) return;
        try {
          const vp = window.cornerstone.getViewport(el);
          if (!vp) return;
          vp.scale = Math.max(0.1, Math.min(10, vp.scale * delta));
          window.cornerstone.setViewport(el, vp);
          // updateImage redraws annotation overlays at the new scale —
          // this is what keeps angle/length labels current during pinch
          window.cornerstone.updateImage(el);
        } catch {
          /* ignore mid-gesture errors */
        }
      } else if (e.touches.length === 1 && !isPinching) {
        // Single-finger pan → forward to Cornerstone active tool
        fireMouseEvent("mousemove", e.touches[0]);
      }
    };

    // ── touchend ────────────────────────────────────────────────────────────
    const onEnd = (e: TouchEvent) => {
      e.preventDefault();

      if (isPinching) {
        isPinching = false;
        pinchDist = null;
      } else if (
        e.changedTouches.length === 1 &&
        touchStartX !== null &&
        touchStartY !== null
      ) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const isSliceSwipe =
          Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx) * 1.5;

        if (isSliceSwipe && seriesFileListRef.current.length > 1) {
          const direction = dy < 0 ? 1 : -1;
          const next = Math.max(
            0,
            Math.min(
              seriesFileListRef.current.length - 1,
              localIndexRef.current + direction,
            ),
          );
          setLocalIndex(next);
          onImageIndexChangeRef.current?.(next);
        } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
          // It's a tap — dispatch a click so measurement tool handlers
          // in ViewerPage's handleViewportClick fire correctly.
          // The click bubbles up to the outer viewport div where onClick
          // is attached; clientX/Y are used for getBoundingClientRect subtraction.
          el.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons: 0,
              clientX: e.changedTouches[0].clientX,
              clientY: e.changedTouches[0].clientY,
            }),
          );
        }
      }

      // Always fire mouseup so Cornerstone tools complete their interaction
      el.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 0,
        }),
      );

      touchStartX = null;
      touchStartY = null;
    };

    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener("touchstart", onStart, opts);
    el.addEventListener("touchmove", onMove, opts);
    el.addEventListener("touchend", onEnd, opts);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []); // intentionally empty — all live values accessed via refs

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
        style={{
          width: "100%",
          height: "100%",
          background: "#000",
          /**
           * touch-action: none
           * Tells the browser to hand ALL touch events to JavaScript without
           * trying to pan/zoom the page itself. This is what makes single-finger
           * pan and pinch-to-zoom work in the viewer without accidentally
           * scrolling the surrounding page.
           */
          touchAction: "none",
        }}
      />

      {/* {loading && (
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
      )} */}
    </div>
  );
}
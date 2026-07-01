import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Share2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  Minus,
  FileText,
  MessageCircle,
  X as XIcon,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useStudies } from "../../context/StudyContext";
import { useAuth } from "../../context/AuthContext";
import { SERIES_MAP, TOOLS } from "./components/viewerConstants";
import { renderImage } from "./components/medicalImages";
import { StudyInfoPanel } from "./components/StudyInfoPanel";
import { DiscussionPanel } from "./components/DiscussionPanel";
import DicomViewer from "./DicomViewer";
import { useMprMeta } from "./components/useMprMeta";
import MprPlaneImage from "./components/MprPlaneImage";
import { useLocalizerStrip } from "./components/useLocalizerStrip";
import SliceScrubber from "./components/SliceScrubber";

// ─── Measurement types ──────────────────────────────────────────────────
type MeasurementType = "length" | "angle" | "area" | "arrow";
type Point = { x: number; y: number };
type Measurement = {
  id: string;
  type: MeasurementType;
  points: Point[];
};

const MEASUREMENT_TOOLS: MeasurementType[] = ["length", "angle", "area", "arrow"];
const isMeasurementTool = (t: string): t is MeasurementType =>
  (MEASUREMENT_TOOLS as string[]).includes(t);

export default function ViewerPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { studies, addComment } = useStudies();
  const { user } = useAuth();

  const study = studies.find((s) => s.id === id);

  const [activeSeries, setActiveSeries] = useState(0);
  const [currentSlice, setCurrentSlice] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [activeTool, setActiveTool] = useState("pan");
  const [toolTrigger, setToolTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<"info" | "discussion">(
    searchParams.get("tab") === "report" ? "discussion" : "info",
  );
  const [comment, setComment] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showReport, setShowReport] = useState(false);
  const [toolPage, setToolPage] = useState(0);
  const commentEndRef = useRef<HTMLDivElement>(null);

  // ── Transform state ────────────────────────────────────────────────────
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [isInverted, setIsInverted] = useState(false);
  const [isCinePlaying, setIsCinePlaying] = useState(false);
  const [isMprMode, setIsMprMode] = useState(false);

  const cineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Real DICOM file count reported back by DicomViewer.
  const [dicomFileCount, setDicomFileCount] = useState(0);

  // ── Real MPR: shared 3D cursor ───────────────────────────────────────────
  // currentSlice (Z/axial), coronalSlice (Y) and sagittalSlice (X) together
  // form ONE shared cursor into the volume. Every MPR pane reads this same
  // cursor and draws a crosshair showing where the other two planes are
  // currently cutting; clicking/dragging in any pane repositions the cursor
  // and all three panes update live — this is the crosshair-linked
  // navigation real MPR viewers use, rather than three independently
  // scrollable but otherwise disconnected planes.
  // (1-based, like currentSlice, so the on-screen "n / max" labels line up.)
  const [coronalSlice, setCoronalSlice] = useState<number | null>(null);
  const [sagittalSlice, setSagittalSlice] = useState<number | null>(null);

  // The backend's /files endpoint now returns only the study's primary
  // real DICOM series (see _primary_series_files in studies.py) — the
  // exact same file set the MPR volume is built from. Previously the
  // frontend re-chunked that list again into N arbitrary equal pieces (one
  // per fake sidebar "series" tab), which meant the axial pane and the
  // MPR volume could end up scrolling through *different* file subsets —
  // that's what made a given "slice N" show a different physical position
  // in the axial pane than in the coronal/sagittal/MIP panes. Passing
  // seriesCount=1 everywhere disables that re-chunking so every view reads
  // the same, already-correct list.
  const seriesCountForVolume = 1;
  // The volume itself is now built server-side (see studies.py /mpr/*) from
  // raw DICOM pixel data, cached in memory per study — this hook only
  // fetches the resulting dimensions, not hundreds of slice images.
  const { meta: mprMeta, loading: mprLoading, error: mprError } = useMprMeta(
    study?.id ?? "",
    activeSeries,
    seriesCountForVolume,
    isMprMode && !!study?.dicom_path,
  );
  const coronalMax = mprMeta?.height ?? 1;
  const sagittalMax = mprMeta?.width ?? 1;

  // Cheap, always-on position indicator for the slice scrubber — sampled
  // from a bounded number of slices, so unlike the full MPR volume this
  // doesn't need to be gated behind MPR mode.
  const { strip: localizerStrip } = useLocalizerStrip(
    study?.id ?? "",
    activeSeries,
    seriesCountForVolume,
    !!study?.dicom_path,
  );

  // ── Measurement state ──────────────────────────────────────────────────
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [pendingPoints, setPendingPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  // ── "Latest value" refs for native (non-React) touch/wheel listeners ────
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const coronalMaxRef = useRef(coronalMax);
  coronalMaxRef.current = coronalMax;
  const sagittalMaxRef = useRef(sagittalMax);
  sagittalMaxRef.current = sagittalMax;

  const placeholderMaxSlices = study
    ? ((SERIES_MAP[study.modality] ?? SERIES_MAP.CT)[activeSeries]?.count ?? 1)
    : 1;
  const maxSlicesForTouch =
    dicomFileCount > 0 ? dicomFileCount : placeholderMaxSlices;
  const maxSlicesRef = useRef(maxSlicesForTouch);
  maxSlicesRef.current = maxSlicesForTouch;

  // Each plane now scrolls its own axis independently — axial moves Z,
  // coronal moves Y, sagittal moves X — instead of only whichever single
  // panel used to be "active".
  const stepAxial = (dir: number) =>
    setCurrentSlice((s) => Math.max(1, Math.min(maxSlicesRef.current, s + dir)));
  const stepCoronal = (dir: number) =>
    setCoronalSlice((s) => {
      const cur = s ?? Math.ceil(coronalMaxRef.current / 2);
      return Math.max(1, Math.min(coronalMaxRef.current, cur + dir));
    });
  const stepSagittal = (dir: number) =>
    setSagittalSlice((s) => {
      const cur = s ?? Math.ceil(sagittalMaxRef.current / 2);
      return Math.max(1, Math.min(sagittalMaxRef.current, cur + dir));
    });

  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const touchDragStartRef = useRef({ x: 0, y: 0 });
  const touchIsDraggingRef = useRef(false);
  // Dragging the crosshair fires a mousemove every couple of pixels, and
  // each one was requesting a brand-new coronal/sagittal/axial image from
  // the server — dozens of in-flight requests per second while dragging.
  // Gating updates to one per ~80ms keeps the drag feeling live without
  // flooding the network; mousedown still updates immediately so clicking
  // feels instant.
  const crosshairThrottleRef = useRef(0);
  const CROSSHAIR_THROTTLE_MS = 80;
  // Trackpads fire dozens of tiny wheel events per swipe; stepping one slice
  // per raw event makes scrolling feel erratic. Accumulating delta and only
  // stepping once it crosses a threshold turns that into smooth, evenly
  // paced slice-per-distance scrolling regardless of input device.
  const WHEEL_SLICE_THRESHOLD = 55;

  // Builds a viewport ref-callback bound to one axis's step function, so
  // axial/coronal/sagittal panes can each be scrolled independently at the
  // same time (rather than only whichever single panel used to be "active").
  const makeViewportRefSetter = (
    wheelAccumRef: React.MutableRefObject<number>,
    stepSlice: (dir: number) => void,
  ) => {
    let cleanup = () => {};
    return (el: HTMLDivElement | null) => {
      cleanup();
      cleanup = () => {};
      if (!el) return;

      const getTouchDist = (touches: TouchList) => {
        const a = touches[0];
        const b = touches[1];
        return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      };

      const onWheelNative = (e: WheelEvent) => {
        if (activeToolRef.current === "zoom") {
          e.preventDefault();
          setZoom((z) => Math.min(3, Math.max(0.3, z - e.deltaY * 0.001)));
          return;
        }
        e.preventDefault();
        wheelAccumRef.current += e.deltaY;
        while (Math.abs(wheelAccumRef.current) >= WHEEL_SLICE_THRESHOLD) {
          const dir = wheelAccumRef.current > 0 ? 1 : -1;
          stepSlice(dir);
          wheelAccumRef.current -= dir * WHEEL_SLICE_THRESHOLD;
        }
      };

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          pinchStartDistRef.current = getTouchDist(e.touches);
          pinchStartZoomRef.current = zoomRef.current;
        } else if (e.touches.length === 1) {
          const t = e.touches[0];
          touchDragStartRef.current = { x: t.clientX, y: t.clientY };
          touchIsDraggingRef.current = true;
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && pinchStartDistRef.current) {
          e.preventDefault();
          const dist = getTouchDist(e.touches);
          const ratio = dist / pinchStartDistRef.current;
          setZoom(Math.min(3, Math.max(0.3, pinchStartZoomRef.current * ratio)));
          return;
        }
        if (e.touches.length === 1 && touchIsDraggingRef.current) {
          const t = e.touches[0];
          if (activeToolRef.current === "pan") {
            e.preventDefault();
            const dx = t.clientX - touchDragStartRef.current.x;
            const dy = t.clientY - touchDragStartRef.current.y;
            setOffset({
              x: offsetRef.current.x + dx,
              y: offsetRef.current.y + dy,
            });
            touchDragStartRef.current = { x: t.clientX, y: t.clientY };
          } else if (activeToolRef.current === "scroll") {
            e.preventDefault();
            const dy = t.clientY - touchDragStartRef.current.y;
            if (Math.abs(dy) > 12) {
              stepSlice(dy < 0 ? 1 : -1);
              touchDragStartRef.current = { x: t.clientX, y: t.clientY };
            }
          }
        }
      };

      const onTouchEnd = () => {
        pinchStartDistRef.current = null;
        touchIsDraggingRef.current = false;
      };

      el.addEventListener("wheel", onWheelNative, { passive: false });
      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd, { passive: false });
      el.addEventListener("touchcancel", onTouchEnd, { passive: false });

      cleanup = () => {
        el.removeEventListener("wheel", onWheelNative);
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("touchcancel", onTouchEnd);
      };
    };
  };

  const axialWheelAccumRef = useRef(0);
  const coronalWheelAccumRef = useRef(0);
  const sagittalWheelAccumRef = useRef(0);
  const setAxialViewportRef = makeViewportRefSetter(axialWheelAccumRef, stepAxial);
  const setCoronalViewportRef = makeViewportRefSetter(coronalWheelAccumRef, stepCoronal);
  const setSagittalViewportRef = makeViewportRefSetter(sagittalWheelAccumRef, stepSagittal);

  // ── Crosshair math: screen click → fraction within the displayed image ──
  // Inverts the same translate/scale(flip)/rotate transform used to render
  // the image, so clicking/dragging on any MPR pane maps back to the right
  // voxel regardless of current zoom/pan/rotation/flip.
  const imagePointFraction = (
    e: { clientX: number; clientY: number; currentTarget: EventTarget },
    imageAspect: number,
  ): { fx: number; fy: number } | null => {
    const container = e.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = e.clientX - cx - offset.x;
    let dy = e.clientY - cy - offset.y;
    dx /= zoom * (flipH ? -1 : 1);
    dy /= zoom * (flipV ? -1 : 1);

    const rotationMod = ((rotation % 360) + 360) % 360;
    if (rotationMod !== 0) {
      const rad = (-rotationMod * Math.PI) / 180;
      const rdx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const rdy = dx * Math.sin(rad) + dy * Math.cos(rad);
      dx = rdx;
      dy = rdy;
    }

    const containerAspect = rect.width / rect.height;
    const containWidth = containerAspect > imageAspect ? rect.height * imageAspect : rect.width;
    const containHeight = containerAspect > imageAspect ? rect.height : rect.width / imageAspect;

    const fx = 0.5 + dx / containWidth;
    const fy = 0.5 + dy / containHeight;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    return { fx, fy };
  };

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    commentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [study?.comments.length]);

  useEffect(() => {
    if (isCinePlaying) {
      cineIntervalRef.current = setInterval(() => {
        setCurrentSlice((s) => (s >= maxSlicesRef.current ? 1 : s + 1));
      }, 80);
    }
    return () => {
      if (cineIntervalRef.current) {
        clearInterval(cineIntervalRef.current);
        cineIntervalRef.current = null;
      }
    };
  }, [isCinePlaying]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPendingPoints([]);
        setHoverPoint(null);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        stepAxial(1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        stepAxial(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handlePostComment = () => {
    if (!comment.trim() || !user) return;
    addComment(study!.id, {
      authorName: user.name,
      authorRole: user.role,
      type: "clinical_note",
      message: comment.trim(),
      timestamp: new Date().toISOString(),
    } as any);
    setComment("");
  };

  const handleToolClick = (toolId: string) => {
    setActiveTool(toolId);
    setToolTrigger((n) => n + 1);

    if (!isMeasurementTool(toolId)) {
      setPendingPoints([]);
      setHoverPoint(null);
    }

    if (toolId === "rotate") setRotation((r) => r + 90);
    if (toolId === "fliph") setFlipH((f) => !f);
    if (toolId === "flipv") setFlipV((f) => !f);
    if (toolId === "invert") setIsInverted((i) => !i);
    if (toolId === "cine") setIsCinePlaying((p) => !p);
    if (toolId === "mpr") {
      setIsMprMode((m) => !m);
    }
    if (toolId === "full") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    }
    if (toolId === "reset") {
      setZoom(1);
      setBrightness(1);
      setOffset({ x: 0, y: 0 });
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setIsInverted(false);
      setIsCinePlaying(false);
      setIsMprMode(false);
      setCoronalSlice(null);
      setSagittalSlice(null);
      setMeasurements([]);
      setPendingPoints([]);
      setHoverPoint(null);
      setCurrentSlice(1);
    }
  };

  if (!study) {
    return (
      <div
        style={{
          height: "100vh",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ color: "#6b7280", fontSize: "14px" }}>Study not found</div>
        <button
          onClick={() => navigate("/studies")}
          style={{
            color: "#60a5fa",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <ArrowLeft size={16} /> Back to worklist
        </button>
      </div>
    );
  }

  const series = SERIES_MAP[study.modality] ?? SERIES_MAP.CT;
  const currentSeries = series[activeSeries];
  const maxSlices = dicomFileCount > 0 ? dicomFileCount : currentSeries.count;

  const TOOLS_PER_PAGE = isMobile ? 8 : TOOLS.length;
  const totalPages = Math.ceil(TOOLS.length / TOOLS_PER_PAGE);
  const visibleTools = TOOLS.slice(
    toolPage * TOOLS_PER_PAGE,
    (toolPage + 1) * TOOLS_PER_PAGE,
  );

  const renderMissingDicomBadge = () =>
    !study.dicom_path && (
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(120,53,15,0.9)",
          border: "1px solid rgba(251,191,36,0.5)",
          borderRadius: "10px",
          padding: "8px 14px",
          color: "#fde68a",
          fontSize: "11px",
          fontFamily: "monospace",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        <AlertTriangle size={14} />
        No DICOM data linked — showing placeholder, not patient imagery
      </div>
    );

  // ── Measurement overlay rendering ───────────────────────────────────────
  const renderMeasurementOverlay = () => (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 4,
      }}
    >
      <defs>
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#60a5fa" />
        </marker>
      </defs>

      {measurements.map((m) => {
        if (m.type === "length" || m.type === "arrow") {
          const [p1, p2] = m.points;
          const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          return (
            <g key={m.id}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#60a5fa"
                strokeWidth={2}
                markerEnd={m.type === "arrow" ? "url(#arrowhead)" : undefined}
              />
              <circle cx={p1.x} cy={p1.y} r={3} fill="#60a5fa" />
              {m.type === "length" && (
                <>
                  <circle cx={p2.x} cy={p2.y} r={3} fill="#60a5fa" />
                  <text
                    x={mx + 6}
                    y={my - 6}
                    fill="#fff"
                    fontSize="11"
                    fontFamily="monospace"
                    style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}
                  >
                    {dist.toFixed(1)} px
                  </text>
                </>
              )}
            </g>
          );
        }
        if (m.type === "angle") {
          const [a, b, c] = m.points;
          const v1 = Math.atan2(a.y - b.y, a.x - b.x);
          const v2 = Math.atan2(c.y - b.y, c.x - b.x);
          let ang = Math.abs((v2 - v1) * 180) / Math.PI;
          if (ang > 180) ang = 360 - ang;
          return (
            <g key={m.id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={2} />
              <line x1={b.x} y1={b.y} x2={c.x} y2={c.y} stroke="#fbbf24" strokeWidth={2} />
              <circle cx={a.x} cy={a.y} r={3} fill="#fbbf24" />
              <circle cx={b.x} cy={b.y} r={4} fill="#fbbf24" />
              <circle cx={c.x} cy={c.y} r={3} fill="#fbbf24" />
              <text
                x={b.x + 10}
                y={b.y - 10}
                fill="#fff"
                fontSize="11"
                fontFamily="monospace"
                style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}
              >
                {ang.toFixed(1)}°
              </text>
            </g>
          );
        }
        if (m.type === "area") {
          const path =
            m.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
          let area = 0;
          for (let i = 0; i < m.points.length; i++) {
            const j = (i + 1) % m.points.length;
            area += m.points[i].x * m.points[j].y;
            area -= m.points[j].x * m.points[i].y;
          }
          area = Math.abs(area) / 2;
          const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length;
          const cy = m.points.reduce((s, p) => s + p.y, 0) / m.points.length;
          return (
            <g key={m.id}>
              <path d={path} fill="rgba(34,197,94,0.18)" stroke="#22c55e" strokeWidth={2} />
              {m.points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill="#22c55e" />
              ))}
              <text
                x={cx}
                y={cy}
                fill="#fff"
                fontSize="11"
                fontFamily="monospace"
                textAnchor="middle"
                style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}
              >
                {area.toFixed(0)} px²
              </text>
            </g>
          );
        }
        return null;
      })}

      {pendingPoints.length > 0 && (
        <g>
          {pendingPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#93c5fd" />
          ))}
          {pendingPoints.length > 1 &&
            pendingPoints.map((p, i) => {
              if (i === 0) return null;
              const prev = pendingPoints[i - 1];
              return (
                <line
                  key={`l${i}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={p.x}
                  y2={p.y}
                  stroke="#93c5fd"
                  strokeWidth={1.5}
                />
              );
            })}
          {hoverPoint && (
            <line
              x1={pendingPoints[pendingPoints.length - 1].x}
              y1={pendingPoints[pendingPoints.length - 1].y}
              x2={hoverPoint.x}
              y2={hoverPoint.y}
              stroke="#93c5fd"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )}
        </g>
      )}
    </svg>
  );

  // ── Crosshair overlay: shows where the OTHER two planes are cutting ─────
  const renderCrosshair = (kind: "axial" | "coronal" | "sagittal") => {
    if (!isMprMode || !mprMeta) return null;
    const sagFrac =
      sagittalMax > 1 ? ((sagittalSlice ?? Math.ceil(sagittalMax / 2)) - 1) / (sagittalMax - 1) : 0.5;
    const corFrac =
      coronalMax > 1 ? ((coronalSlice ?? Math.ceil(coronalMax / 2)) - 1) / (coronalMax - 1) : 0.5;
    const axFrac = maxSlices > 1 ? (currentSlice - 1) / (maxSlices - 1) : 0.5;

    // Pink = sagittal cut position, cyan = coronal cut position, yellow =
    // axial cut position — consistent per-axis coloring across all panes.
    let vFrac: number, vColor: string, hFrac: number, hColor: string;
    if (kind === "axial") {
      vFrac = sagFrac; vColor = "#ec4899";
      hFrac = corFrac; hColor = "#38bdf8";
    } else if (kind === "coronal") {
      vFrac = sagFrac; vColor = "#ec4899";
      hFrac = axFrac; hColor = "#facc15";
    } else {
      vFrac = corFrac; vColor = "#38bdf8";
      hFrac = axFrac; hColor = "#facc15";
    }

    const scaleX = zoom * (flipH ? -1 : 1);
    const scaleY = zoom * (flipV ? -1 : 1);

    return (
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 6,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`,
          transformOrigin: "center center",
        }}
      >
        <line x1={`${vFrac * 100}%`} y1="0" x2={`${vFrac * 100}%`} y2="100%" stroke={vColor} strokeWidth={1} strokeDasharray="5 4" opacity={0.85} />
        <line x1="0" y1={`${hFrac * 100}%`} x2="100%" y2={`${hFrac * 100}%`} stroke={hColor} strokeWidth={1} strokeDasharray="5 4" opacity={0.85} />
      </svg>
    );
  };

  // ── Single-panel viewport (also the MPR axial pane) ─────────────────────
  const renderSinglePanel = (w: string, h: string, label?: string) => {
    // While in MPR mode, the default "pan" tool repositions the shared
    // crosshair instead of panning the image — pure offset-panning isn't
    // very meaningful inside a small orthogonal pane anyway, and this is
    // what makes clicking/dragging any MPR pane move the other two.
    const isCrosshair = isMprMode && activeTool === "pan";

    const localPoint = (e: React.MouseEvent): Point => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const finishMeasurement = (type: MeasurementType, pts: Point[]) => {
      setMeasurements((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type,
          points: pts,
        },
      ]);
      setPendingPoints([]);
      setHoverPoint(null);
    };

    const updateCrosshairFromEvent = (e: React.MouseEvent) => {
      if (!mprMeta) return;
      const frac = imagePointFraction(e, mprMeta.width / mprMeta.height);
      if (!frac) return;
      setSagittalSlice(Math.round(frac.fx * (mprMeta.width - 1)) + 1);
      setCoronalSlice(Math.round(frac.fy * (mprMeta.height - 1)) + 1);
    };

    const handleViewportClick = (e: React.MouseEvent) => {
      if (isCrosshair) return; // handled on mouse down/move instead
      if (!isMeasurementTool(activeTool)) return;
      const p = localPoint(e);
      const next = [...pendingPoints, p];
      if (activeTool === "length" || activeTool === "arrow") {
        if (next.length >= 2) finishMeasurement(activeTool, next);
        else setPendingPoints(next);
      } else if (activeTool === "angle") {
        if (next.length >= 3) finishMeasurement("angle", next);
        else setPendingPoints(next);
      } else if (activeTool === "area") {
        setPendingPoints(next);
      }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      if (activeTool === "area" && pendingPoints.length >= 3) {
        e.preventDefault();
        finishMeasurement("area", pendingPoints);
      }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      if (isCrosshair) {
        setIsDragging(true);
        updateCrosshairFromEvent(e);
        return;
      }
      if (isMeasurementTool(activeTool)) return;
      if (activeTool === "pan") {
        setIsDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      } else if (
        activeTool === "wl" ||
        activeTool === "scroll" ||
        activeTool === "zoom"
      ) {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (isCrosshair) {
        if (isDragging) {
          const now = Date.now();
          if (now - crosshairThrottleRef.current >= CROSSHAIR_THROTTLE_MS) {
            crosshairThrottleRef.current = now;
            updateCrosshairFromEvent(e);
          }
        }
        return;
      }
      if (isMeasurementTool(activeTool) && pendingPoints.length > 0) {
        setHoverPoint(localPoint(e));
      }
      if (!isDragging) return;
      if (activeTool === "pan") {
        setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      } else if (activeTool === "wl") {
        const dy = e.clientY - dragStart.y;
        if (Math.abs(dy) > 1) {
          setBrightness((b) => Math.max(0.1, Math.min(2.5, b - dy * 0.005)));
          setDragStart({ x: e.clientX, y: e.clientY });
        }
      } else if (activeTool === "scroll") {
        const dy = e.clientY - dragStart.y;
        if (Math.abs(dy) > 8) {
          stepAxial(dy > 0 ? 1 : -1);
          setDragStart({ x: e.clientX, y: e.clientY });
        }
      } else if (activeTool === "zoom") {
        const dy = e.clientY - dragStart.y;
        if (Math.abs(dy) > 1) {
          setZoom((z) => Math.max(0.3, Math.min(3, z - dy * 0.003)));
          setDragStart({ x: e.clientX, y: e.clientY });
        }
      }
    };

    const handleMouseUp = () => setIsDragging(false);

    const cursor = isCrosshair
      ? "crosshair"
      : isMeasurementTool(activeTool)
        ? "crosshair"
        : activeTool === "pan"
          ? isDragging
            ? "grabbing"
            : "grab"
          : activeTool === "zoom"
            ? "zoom-in"
            : activeTool === "wl" || activeTool === "scroll"
              ? "ns-resize"
              : "default";

    const scaleX = zoom * (flipH ? -1 : 1);
    const scaleY = zoom * (flipV ? -1 : 1);
    const placeholderTransform = `translate(${offset.x}px, ${offset.y}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`;

    const inner = study.dicom_path ? (
      <div
        style={{
          width: "100%",
          height: "100%",
          filter: `brightness(${brightness}) ${isInverted ? "invert(1)" : ""}`,
        }}
      >
        <DicomViewer
          dicomPath={study.dicom_path}
          studyId={study.id}
          brightness={brightness}
          zoom={zoom}
          activeTool={activeTool}
          toolTrigger={toolTrigger}
          rotation={rotation}
          flipH={flipH}
          flipV={flipV}
          isInverted={isInverted}
          imageIndex={currentSlice - 1}
          offsetX={offset.x}
          offsetY={offset.y}
          activeSeries={activeSeries}
          seriesCount={1}
          onFileCountChange={setDicomFileCount}
        />
      </div>
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: placeholderTransform,
          transformOrigin: "center center",
          transition: isDragging ? "none" : "transform 0.1s ease",
          filter: `brightness(${brightness}) ${isInverted ? "invert(1)" : ""}`,
        }}
      >
        {renderImage(study.modality, 1)}
      </div>
    );

    return (
      <div
        ref={setAxialViewportRef}
        style={{
          width: w,
          height: h,
          overflow: "hidden",
          touchAction: "none",
          cursor,
          position: "relative",
        }}
        onClick={handleViewportClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {inner}
        {renderCrosshair("axial")}
        {label && (
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              fontSize: "10px",
              fontFamily: "monospace",
              color: "#93c5fd",
              background: "rgba(0,0,0,0.55)",
              padding: "2px 6px",
              borderRadius: "4px",
              pointerEvents: "none",
              zIndex: 5,
            }}
          >
            {label}
          </div>
        )}
        {renderMeasurementOverlay()}
      </div>
    );
  };

  // ── MPR panel chrome ─────────────────────────────────────────────────────
  const mprPanelWrapperStyle: React.CSSProperties = {
    background: "#000",
    border: "2px solid #333",
    overflow: "hidden",
    position: "relative",
    boxSizing: "border-box",
  };

  // A small, quiet spinner for the (usually few-second, first-open-only)
  // wait while the server builds the volume for this series. Deliberately
  // not the old "Reconstructing… NN%" text block — just enough to tell the
  // difference between "still loading" and "nothing here", without
  // dominating the panel.
  const renderMprSpinner = () => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <style>{`@keyframes mprSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      <Loader2 size={18} color="#4b5563" style={{ animation: "mprSpin 0.9s linear infinite" }} />
    </div>
  );

  // ── Reconstructed coronal/sagittal panel ────────────────────────────────
  // The cut itself is now built server-side (see /mpr/coronal, /mpr/sagittal
  // in studies.py) from the cached volume — this just points an <img> at the
  // right URL for the current slice, same as the axial pane. Like the axial
  // pane, clicking/dragging with the default "pan" tool repositions the
  // shared crosshair, live-updating the other two panes.
  const renderPlanePanel = (plane: "coronal" | "sagittal", label: string) => {
    const sliceMax = plane === "coronal" ? coronalMax : sagittalMax;
    const sliceValue =
      (plane === "coronal" ? coronalSlice : sagittalSlice) ??
      Math.ceil(sliceMax / 2);

    const planeSrc = mprMeta
      ? `/api/v1/studies/${study.id}/mpr/${plane}?${plane === "coronal" ? "y" : "x"}=${
          sliceValue - 1
        }&series=${activeSeries}&series_count=${series.length}`
      : null;

    const isCrosshair = activeTool === "pan";

    const localPoint = (e: React.MouseEvent): Point => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const finishMeasurement = (type: MeasurementType, pts: Point[]) => {
      setMeasurements((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type,
          points: pts,
        },
      ]);
      setPendingPoints([]);
      setHoverPoint(null);
    };

    const updateCrosshairFromEvent = (e: React.MouseEvent) => {
      if (!mprMeta) return;
      const aspect = plane === "coronal" ? mprMeta.width / mprMeta.depth : mprMeta.height / mprMeta.depth;
      const frac = imagePointFraction(e, aspect);
      if (!frac) return;
      const z = Math.max(1, Math.min(maxSlicesRef.current, Math.round(frac.fy * (mprMeta.depth - 1)) + 1));
      if (plane === "coronal") {
        setSagittalSlice(Math.round(frac.fx * (mprMeta.width - 1)) + 1);
      } else {
        setCoronalSlice(Math.round(frac.fx * (mprMeta.height - 1)) + 1);
      }
      setCurrentSlice(z);
    };

    const handleViewportClick = (e: React.MouseEvent) => {
      if (isCrosshair) return;
      if (!isMeasurementTool(activeTool)) return;
      const p = localPoint(e);
      const next = [...pendingPoints, p];
      if (activeTool === "length" || activeTool === "arrow") {
        if (next.length >= 2) finishMeasurement(activeTool, next);
        else setPendingPoints(next);
      } else if (activeTool === "angle") {
        if (next.length >= 3) finishMeasurement("angle", next);
        else setPendingPoints(next);
      } else if (activeTool === "area") {
        setPendingPoints(next);
      }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      if (activeTool === "area" && pendingPoints.length >= 3) {
        e.preventDefault();
        finishMeasurement("area", pendingPoints);
      }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      if (isCrosshair) {
        setIsDragging(true);
        updateCrosshairFromEvent(e);
        return;
      }
      if (isMeasurementTool(activeTool)) return;
      if (activeTool === "wl" || activeTool === "scroll" || activeTool === "zoom") {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (isCrosshair) {
        if (isDragging) {
          const now = Date.now();
          if (now - crosshairThrottleRef.current >= CROSSHAIR_THROTTLE_MS) {
            crosshairThrottleRef.current = now;
            updateCrosshairFromEvent(e);
          }
        }
        return;
      }
      if (isMeasurementTool(activeTool) && pendingPoints.length > 0) {
        setHoverPoint(localPoint(e));
      }
      if (!isDragging) return;
      if (activeTool === "wl") {
        const dy = e.clientY - dragStart.y;
        if (Math.abs(dy) > 1) {
          setBrightness((b) => Math.max(0.1, Math.min(2.5, b - dy * 0.005)));
          setDragStart({ x: e.clientX, y: e.clientY });
        }
      } else if (activeTool === "scroll") {
        const dy = e.clientY - dragStart.y;
        if (Math.abs(dy) > 8) {
          (plane === "coronal" ? stepCoronal : stepSagittal)(dy > 0 ? 1 : -1);
          setDragStart({ x: e.clientX, y: e.clientY });
        }
      } else if (activeTool === "zoom") {
        const dy = e.clientY - dragStart.y;
        if (Math.abs(dy) > 1) {
          setZoom((z) => Math.max(0.3, Math.min(3, z - dy * 0.003)));
          setDragStart({ x: e.clientX, y: e.clientY });
        }
      }
    };

    const handleMouseUp = () => setIsDragging(false);

    const cursor = isCrosshair
      ? "crosshair"
      : isMeasurementTool(activeTool)
        ? "crosshair"
        : activeTool === "zoom"
          ? "zoom-in"
          : activeTool === "wl" || activeTool === "scroll"
            ? "ns-resize"
            : "default";

    return (
      <div
        ref={plane === "coronal" ? setCoronalViewportRef : setSagittalViewportRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          touchAction: "none",
          cursor,
          position: "relative",
        }}
        onClick={handleViewportClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {planeSrc && (
          <MprPlaneImage
            src={planeSrc}
            brightness={brightness}
            isInverted={isInverted}
            zoom={zoom}
            rotation={rotation}
            flipH={flipH}
            flipV={flipV}
            offsetX={offset.x}
            offsetY={offset.y}
          />
        )}
        {mprLoading && !planeSrc && renderMprSpinner()}
        {mprError && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ef4444",
              fontSize: 10,
              fontFamily: "monospace",
              textAlign: "center",
              padding: 12,
            }}
          >
            {mprError}
          </div>
        )}
        {renderCrosshair(plane)}
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            fontSize: "10px",
            fontFamily: "monospace",
            color: "#93c5fd",
            background: "rgba(0,0,0,0.55)",
            padding: "2px 6px",
            borderRadius: "4px",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {label} · {sliceValue}/{sliceMax}
        </div>
        {renderMeasurementOverlay()}
      </div>
    );
  };

  // ── 4th quadrant: MIP (a real 3D-derived render, not a placeholder) ─────
  // Full rotatable GPU volume rendering + freeform oblique planes remain a
  // bigger follow-up, but a Maximum Intensity Projection is a real,
  // standard "3D" radiology view computed server-side from the same cached
  // volume the coronal/sagittal panes use — no reason to leave this
  // quadrant fake in the meantime.
  const render3dPanel = () => {
    const mipSrc = mprMeta
      ? `/api/v1/studies/${study.id}/mpr/mip?series=${activeSeries}&series_count=${series.length}`
      : null;
    // MIP's vertical axis IS the axial (Z) axis, so a line at the current
    // slice's fraction down that axis shows exactly what level of the body
    // the axial/coronal/sagittal panes are currently looking at — same
    // idea as the crosshair lines, just for "where am I along the body."
    const axFrac = maxSlices > 1 ? (currentSlice - 1) / (maxSlices - 1) : 0.5;

    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        {mipSrc && (
          <MprPlaneImage
            src={mipSrc}
            brightness={brightness}
            isInverted={isInverted}
            zoom={1}
            rotation={0}
            flipH={false}
            flipV={false}
            offsetX={0}
            offsetY={0}
          />
        )}
        {mipSrc && (
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 6,
            }}
          >
            <line
              x1="0"
              y1={`${axFrac * 100}%`}
              x2="100%"
              y2={`${axFrac * 100}%`}
              stroke="#facc15"
              strokeWidth={1}
              strokeDasharray="5 4"
              opacity={0.85}
            />
          </svg>
        )}
        {mprLoading && !mipSrc && renderMprSpinner()}
        {mprError && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ef4444",
              fontSize: 10,
              fontFamily: "monospace",
              textAlign: "center",
              padding: 12,
            }}
          >
            {mprError}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            fontSize: "10px",
            fontFamily: "monospace",
            color: "#93c5fd",
            background: "rgba(0,0,0,0.55)",
            padding: "2px 6px",
            borderRadius: "4px",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          3D · MIP projection · Level {currentSlice}/{maxSlices}
        </div>
      </div>
    );
  };

  // ── Viewport: single panel OR 2×2 real, crosshair-linked MPR quad ───────
  const renderViewport = (w: string, h: string) => {
    if (!isMprMode) return renderSinglePanel(w, h);

    return (
      <div
        style={{
          width: w,
          height: h,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: "2px",
          background: "#1a1a1a",
        }}
      >
        <div style={mprPanelWrapperStyle}>
          {renderSinglePanel("100%", "100%", `Axial · ${currentSlice}/${maxSlices}`)}
        </div>
        <div style={mprPanelWrapperStyle}>{renderPlanePanel("coronal", "Coronal")}</div>
        <div style={mprPanelWrapperStyle}>{renderPlanePanel("sagittal", "Sagittal")}</div>
        <div style={mprPanelWrapperStyle}>{render3dPanel()}</div>
      </div>
    );
  };

  // ─── MOBILE LAYOUT ──────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        style={{
          height: "100vh",
          background: "#000",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: "44px",
            background: "#0d0d0d",
            borderBottom: "1px solid #2a2a2a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => navigate("/studies")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "#9ca3af",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            <ArrowLeft size={16} /> Worklist
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#fff", fontSize: "12px", fontWeight: 600 }}>
              {study.patient.name}
            </div>
            <div style={{ color: "#6b7280", fontSize: "10px" }}>
              {study.description}
            </div>
          </div>
          <button
            style={{
              color: "#9ca3af",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Share2 size={16} />
          </button>
        </div>

        {/* Series thumbnails */}
        <div
          style={{
            height: "80px",
            background: "#0d0d0d",
            borderBottom: "1px solid #2a2a2a",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "0 12px",
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {series.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                setActiveSeries(i);
                setCurrentSlice(1);
                setCoronalSlice(null);
                setSagittalSlice(null);
              }}
              style={{
                flexShrink: 0,
                width: "60px",
                background: "#111",
                border: `2px solid ${i === activeSeries ? "#1A73E8" : "#2a2a2a"}`,
                borderRadius: "8px",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "40px",
                  overflow: "hidden",
                  borderRadius: "4px",
                }}
              >
                {renderImage(study.modality, 1)}
              </div>
              <div
                style={{
                  fontSize: "8px",
                  color: i === activeSeries ? "#60a5fa" : "#6b7280",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {s.label}
              </div>
            </button>
          ))}
        </div>

        {/* Viewport */}
        <div
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            background: "#000",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px",
            }}
          >
            {renderViewport("100%", "100%")}
          </div>
          {renderMissingDicomBadge()}

          {!!study.dicom_path && maxSlices > 1 && (
            <SliceScrubber
              currentSlice={currentSlice}
              maxSlices={maxSlices}
              onScrub={setCurrentSlice}
              strip={localizerStrip}
            />
          )}

          {!isMprMode && (
            <>
              <div
                style={{
                  position: "absolute",
                  top: "8px",
                  left: "8px",
                  fontFamily: "monospace",
                  fontSize: "10px",
                  color: "#fff",
                  textShadow: "1px 1px 2px rgba(0,0,0,0.9)",
                  lineHeight: 1.7,
                  pointerEvents: "none",
                }}
              >
                <div>{study.patient.name}</div>
                <div>{study.patient.sex}</div>
                <div style={{ color: "#fbbf24" }}>{study.description}</div>
              </div>

              <div
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  fontFamily: "monospace",
                  fontSize: "10px",
                  color: "#fff",
                  textShadow: "1px 1px 2px rgba(0,0,0,0.9)",
                  lineHeight: 1.7,
                  textAlign: "right",
                  pointerEvents: "none",
                }}
              >
                <div>W: 80 L: 40</div>
                <div>Zoom: {Math.round(zoom * 100)}%</div>
                <div>Img: {currentSlice}/{maxSlices}</div>
              </div>

              <div
                style={{
                  position: "absolute",
                  bottom: "8px",
                  left: "8px",
                  fontFamily: "monospace",
                  fontSize: "9px",
                  color: "#9ca3af",
                  pointerEvents: "none",
                }}
              >
                <div>KV: 120 mAs: 300</div>
              </div>

              <div
                style={{
                  position: "absolute",
                  bottom: "8px",
                  right: "8px",
                  fontFamily: "monospace",
                  fontSize: "9px",
                  color: "#9ca3af",
                  textAlign: "right",
                  pointerEvents: "none",
                }}
              >
                <div>Kenyatta National Hospital</div>
                <div>{currentSeries.label}</div>
              </div>
            </>
          )}

          {maxSlices > 1 && (
            <div
              style={{
                position: "absolute",
                bottom: "32px",
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: "rgba(0,0,0,0.6)",
                borderRadius: "20px",
                padding: "6px 14px",
                backdropFilter: "blur(4px)",
                zIndex: 10,
              }}
            >
              <button
                onClick={() => setCurrentSlice(Math.max(1, currentSlice - 1))}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  padding: "2px",
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <span
                style={{
                  color: "#fff",
                  fontSize: "11px",
                  fontFamily: "monospace",
                  minWidth: "50px",
                  textAlign: "center",
                }}
              >
                {currentSlice} / {maxSlices}
              </span>
              <button
                onClick={() => setCurrentSlice(Math.min(maxSlices, currentSlice + 1))}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  padding: "2px",
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div
          style={{
            background: "#0d0d0d",
            borderTop: "1px solid #2a2a2a",
            flexShrink: 0,
            padding: "8px 12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ flex: 1, display: "flex", gap: "4px", overflowX: "auto" }}>
              {visibleTools.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleToolClick(t.id)}
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    padding: "6px 8px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    background:
                      activeTool === t.id
                        ? "#1A73E8"
                        : (t.id === "cine" && isCinePlaying) ||
                            (t.id === "invert" && isInverted) ||
                            (t.id === "mpr" && isMprMode)
                          ? "rgba(26,115,232,0.3)"
                          : "#1a1a1a",
                    color: activeTool === t.id ? "#fff" : "#9ca3af",
                    minWidth: "44px",
                  }}
                >
                  <t.icon size={16} />
                  <span style={{ fontSize: "9px", fontWeight: 600 }}>{t.label}</span>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
                <button
                  onClick={() => setToolPage((p) => Math.max(0, p - 1))}
                  disabled={toolPage === 0}
                  style={{
                    background: "#2a2a2a",
                    border: "none",
                    borderRadius: "4px",
                    color: toolPage === 0 ? "#333" : "#9ca3af",
                    cursor: toolPage === 0 ? "default" : "pointer",
                    padding: "3px",
                  }}
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  onClick={() => setToolPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={toolPage === totalPages - 1}
                  style={{
                    background: "#2a2a2a",
                    border: "none",
                    borderRadius: "4px",
                    color: toolPage === totalPages - 1 ? "#333" : "#9ca3af",
                    cursor: toolPage === totalPages - 1 ? "default" : "pointer",
                    padding: "3px",
                  }}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: "8px", color: "#6b7280" }}>BRT</span>
              <input
                type="range"
                min={0.2}
                max={2}
                step={0.05}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                style={{ width: "50px", accentColor: "#1A73E8" }}
              />
            </div>

            <button
              onClick={() => setShowReport(true)}
              style={{
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                padding: "6px 10px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                background: "#1A73E8",
                color: "#fff",
                minWidth: "52px",
              }}
            >
              <FileText size={16} />
              <span style={{ fontSize: "9px", fontWeight: 600 }}>Report</span>
            </button>
          </div>
        </div>

        {/* Report sheet */}
        {showReport && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "flex-end",
            }}
            onClick={() => setShowReport(false)}
          >
            <div
              style={{
                width: "100%",
                background: "#111",
                borderRadius: "16px 16px 0 0",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #2a2a2a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", gap: "0" }}>
                  {(["info", "discussion"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 600,
                        background: activeTab === tab ? "#1A73E8" : "transparent",
                        color: activeTab === tab ? "#fff" : "#6b7280",
                      }}
                    >
                      {tab === "info" ? "Study Info" : `Discussion (${study.comments.length})`}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowReport(false)}
                  style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer" }}
                >
                  <XIcon size={20} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                {activeTab === "info" && <StudyInfoPanel study={study} />}
                {activeTab === "discussion" && (
                  <DiscussionPanel
                    study={study}
                    comment={comment}
                    setComment={setComment}
                    onPost={handlePostComment}
                    commentEndRef={commentEndRef}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── DESKTOP LAYOUT ─────────────────────────────────────────────────────
  return (
    <div
      style={{
        height: "100vh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: "48px",
          background: "#0d0d0d",
          borderBottom: "1px solid #2a2a2a",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate("/studies")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: "#9ca3af",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            padding: "6px 10px",
            borderRadius: "8px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <ArrowLeft size={16} /> Back to Worklist
        </button>
        <div style={{ width: "1px", height: "20px", background: "#2a2a2a" }} />
        <div style={{ flex: 1 }}>
          <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600 }}>
            {study.patient.name}
          </span>
          <span style={{ color: "#6b7280", fontSize: "12px", marginLeft: "8px" }}>
            {study.patient.patientId} · {study.description}
          </span>
        </div>
        {study.isUrgent && (
          <span
            style={{
              padding: "3px 10px",
              background: "rgba(239,68,68,0.2)",
              border: "1px solid rgba(239,68,68,0.5)",
              borderRadius: "6px",
              color: "#f87171",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            URGENT
          </span>
        )}
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: "#9ca3af",
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            cursor: "pointer",
            fontSize: "13px",
            padding: "6px 12px",
            borderRadius: "8px",
          }}
        >
          <Share2 size={14} /> Share
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Series sidebar */}
        <div
          style={{
            width: "160px",
            background: "#0d0d0d",
            borderRight: "1px solid #2a2a2a",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "8px 8px 4px",
              fontSize: "10px",
              fontWeight: 700,
              color: "#4b5563",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            SERIES
          </div>
          {series.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                setActiveSeries(i);
                setCurrentSlice(1);
                setCoronalSlice(null);
                setSagittalSlice(null);
              }}
              style={{
                background: i === activeSeries ? "rgba(26,115,232,0.15)" : "transparent",
                border: "none",
                borderLeft: `3px solid ${i === activeSeries ? "#1A73E8" : "transparent"}`,
                cursor: "pointer",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div
                style={{
                  width: "120px",
                  height: "90px",
                  borderRadius: "6px",
                  overflow: "hidden",
                  background: "#111",
                  border: `1px solid ${i === activeSeries ? "#1A73E8" : "#2a2a2a"}`,
                }}
              >
                {renderImage(study.modality, 1)}
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: i === activeSeries ? "#93c5fd" : "#d1d5db",
                    fontWeight: 600,
                  }}
                >
                  {s.label}
                </div>
                <div style={{ fontSize: "10px", color: "#4b5563" }}>{s.count} imgs</div>
              </div>
            </button>
          ))}
        </div>

        {/* Main viewport */}
        <div
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            background: "#000",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: isMprMode ? "8px" : "16px",
            }}
          >
            <div style={{ width: isMprMode ? "100%" : "88%", height: isMprMode ? "100%" : "88%" }}>
              {renderViewport("100%", "100%")}
            </div>
          </div>
          {renderMissingDicomBadge()}

          {!!study.dicom_path && maxSlices > 1 && (
            <SliceScrubber
              currentSlice={currentSlice}
              maxSlices={maxSlices}
              onScrub={setCurrentSlice}
              strip={localizerStrip}
              rightOffset="64px"
            />
          )}

          {!isMprMode && (
            <>
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  left: "12px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: "#fff",
                  textShadow: "1px 1px 2px rgba(0,0,0,0.9)",
                  lineHeight: 1.7,
                  pointerEvents: "none",
                }}
              >
                <div>{study.patient.name}</div>
                <div>{study.patient.dob} · {study.patient.sex}</div>
                <div style={{ color: "#9ca3af" }}>{study.patient.patientId}</div>
                <div style={{ color: "#fbbf24", marginTop: "2px" }}>{study.description}</div>
              </div>

              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: "#fff",
                  textShadow: "1px 1px 2px rgba(0,0,0,0.9)",
                  lineHeight: 1.7,
                  textAlign: "right",
                  pointerEvents: "none",
                }}
              >
                <div>W: 80 L: 40</div>
                <div>Zoom: {Math.round(zoom * 100)}%</div>
                <div>Img: {currentSlice} / {maxSlices}</div>
                <div style={{ color: "#6b7280" }}>{currentSeries.label}</div>
              </div>

              <div
                style={{
                  position: "absolute",
                  bottom: "12px",
                  left: "12px",
                  fontFamily: "monospace",
                  fontSize: "10px",
                  color: "#6b7280",
                  pointerEvents: "none",
                }}
              >
                <div>
                  {new Date(study.studyDate).toLocaleDateString()}{" "}
                  {new Date(study.studyDate).toLocaleTimeString()}
                </div>
                <div>KV: 120 mAs: 300</div>
              </div>

              <div
                style={{
                  position: "absolute",
                  bottom: "12px",
                  right: "12px",
                  fontFamily: "monospace",
                  fontSize: "10px",
                  color: "#6b7280",
                  textAlign: "right",
                  pointerEvents: "none",
                }}
              >
                <div>{study.institution}</div>
                <div>Series: {currentSeries.label}</div>
              </div>
            </>
          )}

          {maxSlices > 1 && (
            <div
              style={{
                position: "absolute",
                bottom: "40px",
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                background: "rgba(0,0,0,0.65)",
                borderRadius: "24px",
                padding: "8px 18px",
                backdropFilter: "blur(4px)",
                border: "1px solid rgba(255,255,255,0.08)",
                zIndex: 10,
              }}
            >
              <button
                onClick={() => setCurrentSlice(Math.max(1, currentSlice - 1))}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
              >
                <ChevronLeft size={18} />
              </button>
              <span
                style={{
                  color: "#fff",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  minWidth: "60px",
                  textAlign: "center",
                }}
              >
                {currentSlice} / {maxSlices}
              </span>
              <button
                onClick={() => setCurrentSlice(Math.min(maxSlices, currentSlice + 1))}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* Zoom/brightness quick controls — hidden in MPR mode to save space */}
          {!isMprMode && (
            <div
              style={{
                position: "absolute",
                right: "16px",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                background: "rgba(0,0,0,0.6)",
                borderRadius: "12px",
                padding: "10px 8px",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <button
                onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "4px" }}
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "4px" }}
              >
                <Minus size={16} />
              </button>
              <div style={{ width: "1px", height: "8px", background: "#2a2a2a", margin: "0 auto" }} />
              <button
                onClick={() => setBrightness((b) => Math.min(2.5, b + 0.1))}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "4px", fontSize: "12px", fontWeight: 700 }}
              >
                +B
              </button>
              <button
                onClick={() => setBrightness((b) => Math.max(0.1, b - 0.1))}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "4px", fontSize: "12px", fontWeight: 700 }}
              >
                -B
              </button>
              <div style={{ width: "1px", height: "8px", background: "#2a2a2a", margin: "0 auto" }} />
              <button
                onClick={() => handleToolClick("reset")}
                style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: "4px" }}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div
          style={{
            width: "280px",
            background: "#0f0f0f",
            borderLeft: "1px solid #2a2a2a",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <div style={{ padding: "12px", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "#4b5563",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "8px",
              }}
            >
              TOOLS
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
              {visibleTools.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleToolClick(t.id)}
                  title={t.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "3px",
                    padding: "7px 4px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    background:
                      activeTool === t.id
                        ? "#1A73E8"
                        : (t.id === "cine" && isCinePlaying) ||
                            (t.id === "invert" && isInverted) ||
                            (t.id === "mpr" && isMprMode)
                          ? "rgba(26,115,232,0.3)"
                          : "rgba(255,255,255,0.05)",
                    color: activeTool === t.id ? "#fff" : "#9ca3af",
                  }}
                >
                  <t.icon size={14} />
                  <span style={{ fontSize: "9px", fontWeight: 600 }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
            {(["info", "discussion"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "10px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "transparent",
                  color: activeTab === tab ? "#60a5fa" : "#6b7280",
                  borderBottom: `2px solid ${activeTab === tab ? "#1A73E8" : "transparent"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                {tab === "info" ? (
                  <><FileText size={13} /> Study Info</>
                ) : (
                  <><MessageCircle size={13} /> Discussion {study.comments.length > 0 && `(${study.comments.length})`}</>
                )}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
            {activeTab === "info" && <StudyInfoPanel study={study} />}
            {activeTab === "discussion" && (
              <DiscussionPanel
                study={study}
                comment={comment}
                setComment={setComment}
                onPost={handlePostComment}
                commentEndRef={commentEndRef}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
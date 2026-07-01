// useLocalizerStrip.ts
//
// A lightweight "where am I in the stack" indicator. Building the full
// volume (useDicomVolume.ts) to show a position marker would mean
// downloading and decoding every slice just to render a scrollbar — too
// expensive to run all the time. Instead this samples a bounded number of
// slices (evenly spaced across the series) and keeps a single center column
// of pixels from each, stacking them into a small coarse strip image. It's
// not diagnostic quality, just enough to silhouette the anatomy so the
// scrubber's position marker has visual context.
import { useEffect, useRef, useState } from "react";
import { getDicomFileList } from "../../../services/studyService";

export interface LocalizerStrip {
  width: number; // = sample column height (pixels within a slice)
  height: number; // = number of samples taken across the stack (depth)
  pixels: Uint8ClampedArray; // grayscale, length = width * height
}

interface LocalizerStripState {
  strip: LocalizerStrip | null;
  loading: boolean;
}

const MAX_SAMPLES = 40;
const stripCache = new Map<string, LocalizerStrip>();

function previewUrl(studyId: string, filename: string): string {
  return `/api/v1/studies/${studyId}/dicom/${encodeURIComponent(filename)}/preview`;
}

// Registering the in-flight <img> lets a cancelled load actually be
// aborted (.src = "" stops the network request) instead of just having its
// result discarded — otherwise a stale series' fetches keep running in the
// background after switching, competing for bandwidth with the new one.
function loadImage(src: string, inFlight: Set<HTMLImageElement>): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    inFlight.add(img);
    const done = () => inFlight.delete(img);
    img.onload = () => {
      done();
      resolve(img);
    };
    img.onerror = () => {
      done();
      reject(new Error(`Failed to load ${src}`));
    };
    img.src = src;
  });
}

export function useLocalizerStrip(
  studyId: string,
  activeSeries: number,
  enabled: boolean,
): LocalizerStripState {
  const [state, setState] = useState<LocalizerStripState>({
    strip: null,
    loading: false,
  });
  const cancelledRef = useRef(false);
  const inFlightRef = useRef<Set<HTMLImageElement>>(new Set());

  useEffect(() => {
    if (!enabled || !studyId) return;

    const cacheKey = `${studyId}:${activeSeries}`;
    const cached = stripCache.get(cacheKey);
    if (cached) {
      setState({ strip: cached, loading: false });
      return;
    }

    cancelledRef.current = false;
    const inFlight = inFlightRef.current;
    setState({ strip: null, loading: true });

    (async () => {
      try {
        // The backend already groups files by real DICOM series (see
        // /studies/{id}/files?series=N) — no client-side re-chunking needed.
        const files = await getDicomFileList(studyId, activeSeries);
        if (files.length === 0) {
          setState({ strip: null, loading: false });
          return;
        }

        const sampleCount = Math.min(MAX_SAMPLES, files.length);
        const sampleIndices = Array.from({ length: sampleCount }, (_, i) =>
          Math.min(
            files.length - 1,
            Math.round((i / Math.max(1, sampleCount - 1)) * (files.length - 1)),
          ),
        );

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        let columnHeight = 0;
        let pixels: Uint8ClampedArray | null = null;

        for (let i = 0; i < sampleIndices.length; i++) {
          if (cancelledRef.current) return;
          const img = await loadImage(previewUrl(studyId, files[sampleIndices[i]]), inFlight);
          const w = img.naturalWidth || 1;
          const h = img.naturalHeight || 1;
          if (!pixels) {
            columnHeight = h;
            pixels = new Uint8ClampedArray(sampleCount * columnHeight);
            canvas.width = w;
            canvas.height = h;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const centerX = Math.floor(canvas.width / 2);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let y = 0; y < columnHeight; y++) {
            const p = (y * canvas.width + centerX) * 4;
            pixels[i * columnHeight + y] = (frame[p] + frame[p + 1] + frame[p + 2]) / 3;
          }
        }

        if (cancelledRef.current || !pixels) return;
        // Row-major: width = columnHeight (pixels within a slice),
        // height = sampleCount (position across the stack).
        const strip: LocalizerStrip = { width: columnHeight, height: sampleCount, pixels };
        stripCache.set(cacheKey, strip);
        setState({ strip, loading: false });
      } catch {
        if (!cancelledRef.current) setState({ strip: null, loading: false });
      }
    })();

    return () => {
      cancelledRef.current = true;
      for (const img of inFlight) {
        img.onload = null;
        img.onerror = null;
        img.src = "";
      }
      inFlight.clear();
    };
  }, [studyId, activeSeries, enabled]);

  return state;
}

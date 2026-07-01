// useDicomVolume.ts
//
// Real MPR (Multi-Planar Reformation/Reconstruction) requires a 3D voxel
// volume, not just more axial images. This hook downloads every JPEG preview
// slice in the active series, decodes each one onto an offscreen canvas, and
// stacks the grayscale pixels into a single Uint8ClampedArray volume that can
// then be re-sliced along the coronal and sagittal planes (see
// reconstructPlane.ts). This is what makes MPR "real" — the coronal/sagittal
// images are genuinely resampled from the axial stack, not the axial stack
// relabeled.
import { useEffect, useRef, useState } from "react";
import { getDicomFileList } from "../../../services/studyService";

export interface DicomVolume {
  width: number; // in-plane X extent (columns), shared by every axial slice
  height: number; // in-plane Y extent (rows), shared by every axial slice
  depth: number; // number of axial slices stacked along Z
  data: Uint8ClampedArray; // length = width * height * depth, grayscale 0-255
}

export interface DicomVolumeState {
  volume: DicomVolume | null;
  loading: boolean;
  progress: number; // 0-100
  error: string | null;
}

const volumeCache = new Map<string, DicomVolume>();

// Reconstructed coronal/sagittal images are inherently limited by the
// number of slices along one axis (often far fewer than the in-plane pixel
// count), so decoding every slice at full native resolution just to throw
// most of that detail away was the main reason building the volume felt
// slow. Capping the in-plane size here cuts decode + getImageData/putImageData
// cost roughly with the square of the scale factor, with no visible loss
// for the reconstructed views (the true axial view still uses the
// full-resolution preview directly, untouched by this).
const MAX_VOLUME_DIM = 320;

function partitionBySeries(
  fileList: string[],
  activeSeries: number,
  seriesCount: number,
): string[] {
  if (fileList.length === 0 || seriesCount <= 1) return fileList;
  const chunkSize = Math.max(1, Math.floor(fileList.length / seriesCount));
  const start = activeSeries * chunkSize;
  const end =
    activeSeries === seriesCount - 1 ? fileList.length : start + chunkSize;
  return fileList.slice(start, end);
}

function previewUrl(studyId: string, filename: string): string {
  return `/api/v1/studies/${studyId}/dicom/${encodeURIComponent(filename)}/preview`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/**
 * Loads and decodes every slice in the given series into a single grayscale
 * volume. Only runs while `enabled` is true (i.e. MPR mode is on), and caches
 * the result per study+series so toggling MPR off/on doesn't re-download.
 */
export function useDicomVolume(
  studyId: string,
  activeSeries: number,
  seriesCount: number,
  enabled: boolean,
): DicomVolumeState {
  const [state, setState] = useState<DicomVolumeState>({
    volume: null,
    loading: false,
    progress: 0,
    error: null,
  });
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!enabled || !studyId) return;

    const cacheKey = `${studyId}:${activeSeries}:${seriesCount}`;
    const cached = volumeCache.get(cacheKey);
    if (cached) {
      setState({ volume: cached, loading: false, progress: 100, error: null });
      return;
    }

    cancelledRef.current = false;
    setState({ volume: null, loading: true, progress: 0, error: null });

    (async () => {
      try {
        const fileList = await getDicomFileList(studyId);
        const files = partitionBySeries(fileList, activeSeries, seriesCount);
        if (files.length === 0) {
          throw new Error("No slices available to reconstruct this series");
        }

        // First slice establishes the in-plane dimensions for the volume,
        // scaled down to MAX_VOLUME_DIM on the longer edge.
        const firstImg = await loadImage(previewUrl(studyId, files[0]));
        const nativeWidth = firstImg.naturalWidth || 1;
        const nativeHeight = firstImg.naturalHeight || 1;
        const scale = Math.min(1, MAX_VOLUME_DIM / Math.max(nativeWidth, nativeHeight));
        const width = Math.max(1, Math.round(nativeWidth * scale));
        const height = Math.max(1, Math.round(nativeHeight * scale));
        const depth = files.length;

        const data = new Uint8ClampedArray(width * height * depth);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D context unavailable");

        const writeSlice = (img: HTMLImageElement, z: number) => {
          ctx.clearRect(0, 0, width, height);
          // Slices are expected to share dimensions; if one doesn't, it's
          // stretched to fit rather than aborting the whole reconstruction.
          // The browser's own bilinear downscale here also softens preview
          // JPEG artifacts a little, which helps the reconstructed views
          // look less blocky.
          ctx.drawImage(img, 0, 0, width, height);
          const frame = ctx.getImageData(0, 0, width, height).data;
          const base = z * width * height;
          for (let p = 0, i = 0; p < width * height; p++, i += 4) {
            data[base + p] = (frame[i] + frame[i + 1] + frame[i + 2]) / 3;
          }
        };

        writeSlice(firstImg, 0);
        if (cancelledRef.current) return;

        // Re-rendering React on every single slice (there can be hundreds)
        // is itself a meaningful chunk of the perceived "loading forever" —
        // only push a state update when the rounded percentage actually
        // changes.
        let lastReportedPct = 0;
        const reportProgress = (z: number) => {
          const pct = Math.round(((z + 1) / depth) * 100);
          if (pct === lastReportedPct) return;
          lastReportedPct = pct;
          setState((s) => ({ ...s, progress: pct }));
        };
        reportProgress(0);

        const CONCURRENCY = 8;
        let nextIndex = 1;
        const worker = async () => {
          while (!cancelledRef.current) {
            const z = nextIndex++;
            if (z >= depth) return;
            const img = await loadImage(previewUrl(studyId, files[z]));
            if (cancelledRef.current) return;
            writeSlice(img, z);
            reportProgress(z);
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, depth) }, worker),
        );
        if (cancelledRef.current) return;

        const volume: DicomVolume = { width, height, depth, data };
        volumeCache.set(cacheKey, volume);
        setState({ volume, loading: false, progress: 100, error: null });
      } catch (err) {
        if (cancelledRef.current) return;
        setState({
          volume: null,
          loading: false,
          progress: 0,
          error: (err as Error).message,
        });
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [studyId, activeSeries, seriesCount, enabled]);

  return state;
}

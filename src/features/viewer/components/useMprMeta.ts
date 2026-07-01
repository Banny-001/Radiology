// useMprMeta.ts
//
// Replaces useDicomVolume.ts. The volume itself is now built server-side
// (see /mpr/meta, /mpr/coronal, /mpr/sagittal, /mpr/mip in studies.py) from
// raw DICOM pixel data — no more downloading and canvas-decoding every
// slice in the browser. This hook only needs the volume's dimensions
// (to know the coronal/sagittal slider ranges), which is a single small
// request instead of hundreds.
import { useEffect, useState } from "react";

export interface MprMeta {
  width: number; // sagittal slice count (X extent)
  height: number; // coronal slice count (Y extent)
  depth: number; // axial slice count (Z extent)
}

interface MprMetaState {
  meta: MprMeta | null;
  loading: boolean;
  error: string | null;
}

const metaCache = new Map<string, MprMeta>();

export function useMprMeta(
  studyId: string,
  activeSeries: number,
  seriesCount: number,
  enabled: boolean,
): MprMetaState {
  const [state, setState] = useState<MprMetaState>({
    meta: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !studyId) return;

    const cacheKey = `${studyId}:${activeSeries}:${seriesCount}`;
    const cached = metaCache.get(cacheKey);
    if (cached) {
      setState({ meta: cached, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ meta: null, loading: true, error: null });

    const url = `/api/v1/studies/${studyId}/mpr/meta?series=${activeSeries}&series_count=${seriesCount}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(body || `Failed to load volume info (${res.status})`);
        }
        return (await res.json()) as MprMeta;
      })
      .then((meta) => {
        if (cancelled) return;
        metaCache.set(cacheKey, meta);
        setState({ meta, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ meta: null, loading: false, error: (err as Error).message });
      });

    return () => {
      cancelled = true;
    };
  }, [studyId, activeSeries, seriesCount, enabled]);

  return state;
}

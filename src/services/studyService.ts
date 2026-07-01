import { zip } from "fflate";

const BASE = "/api/v1";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StudyPayload {
  patient_name: string;
  patient_id: string;
  date_of_birth?: string;
  sex?: string;
  modality: string;
  description: string;
  referring_doctor?: string;
  institution?: string;
  clinical_history?: string;
  is_urgent: boolean;
}

export interface StudyOut extends StudyPayload {
  id: string;
  status: string;
  number_of_images: number;
  study_instance_uid: string | null;
  accession_number: string | null;
  ai_report: string | null;
  ai_confidence: string | null;
  dicom_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyListOut {
  total: number;
  page: number;
  page_size: number;
  items: StudyOut[];
}

export interface StudyUpdate {
  status?: string;
  referring_doctor?: string;
  clinical_history?: string;
  is_urgent?: boolean;
  ai_report?: string;
  ai_confidence?: string;
  dicom_path?: string;
}

export interface DicomFileListResponse {
  files: string[];
}

export interface SeriesInfo {
  index: number;
  count: number;
  modality: string;
  description: string;
  is_scout: boolean;
}

export interface StudySeriesResponse {
  series: SeriesInfo[];
}

// ─── Typed API error ──────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  retries = 1,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(300 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        if (res.status === 204 || res.status === 205) return undefined as T;
        const text = await res.text();
        return text ? (JSON.parse(text) as T) : (undefined as T);
      }
      const body = await res.text();
      if (res.status < 500) throw new ApiError(res.status, body);
      lastErr = new ApiError(res.status, body);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

// ─── TTL cache ────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}

// ─── In-flight deduplication ──────────────────────────────────────────────────

const inFlight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

// ─── Cache instances ──────────────────────────────────────────────────────────

const studyListCache = new TtlCache<StudyListOut>();
const studyCache = new TtlCache<StudyOut>();
const fileListCache = new TtlCache<string[]>();
const seriesInfoCache = new TtlCache<SeriesInfo[]>();

const TTL = {
  studyList: 30_000,
  study: 60_000,
  fileList: 5 * 60_000,
  seriesInfo: 5 * 60_000,
} as const;

// ─── ZIP helper ───────────────────────────────────────────────────────────────
//
// Reads files one at a time (sequential) to keep peak browser RAM low, then
// compresses with DEFLATE level 3.
//
// Level 3 vs level 0 (STORE):
//   • Uncompressed CT DICOM pixel data (air regions, bone edges) typically
//     achieves 25-40% size reduction with DEFLATE.
//   • For a 2521-file CT study ~1.3 GB → ~800 MB-950 MB after compression.
//   • That directly cuts upload time by 25-40% with no other changes.
//   • CPU cost is small compared to network transfer time.

function bundleAsZip(
  files: File[],
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    ;(async () => {
      const input: Record<string, [Uint8Array, { level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }]> = {};

      for (let i = 0; i < files.length; i++) {
        const buf = await files[i].arrayBuffer();
        input[files[i].name] = [new Uint8Array(buf), { level: 3 }]; // ← was level: 0
        onProgress?.(Math.round(((i + 1) / files.length) * 50)); // 0–50% for zipping
      }

      zip(input, (err, data) => {
        if (err) return reject(err);
        onProgress?.(100);
        resolve(new Blob([data], { type: "application/zip" }));
      });
    })().catch(reject);
  });
}

// ─── Study mutations ──────────────────────────────────────────────────────────

export async function createStudy(payload: StudyPayload): Promise<StudyOut> {
  const study = await apiFetch<StudyOut>(`${BASE}/studies/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  studyListCache.invalidatePrefix("studies:");
  studyCache.set(`study:${study.id}`, study, TTL.study);
  return study;
}

export async function uploadDicom(studyId: string, file: File): Promise<StudyOut> {
  const form = new FormData();
  form.append("file", file);
  const study = await apiFetch<StudyOut>(
    `${BASE}/studies/${studyId}/upload-dicom`,
    { method: "POST", body: form },
  );
  studyCache.set(`study:${studyId}`, study, TTL.study);
  fileListCache.delete(`files:${studyId}`);
  studyListCache.invalidatePrefix("studies:");
  return study;
}

// ── Batch upload ───────────────────────────────────────────────────────────────
//
// Splits files into batches of BATCH_SIZE, zips each batch, uploads sequentially.
//
// BATCH_SIZE 200 (up from 100):
//   • 2521 files → 13 batches instead of 26  (half the HTTP round trips)
//   • Peak RAM per batch: 200 × 529 KB × 2 ≈ 212 MB — fine on desktop/laptop
//
// If uploads still feel slow, the bottleneck is raw bandwidth (1.3 GB of CT
// data over a ~5 Mbps connection ≈ 30-35 min irreducible minimum).
// The compression above is the biggest lever within the browser.

const BATCH_SIZE = 200; // ← was 100

export async function uploadDicomBatch(
  studyId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<StudyOut> {
  if (files.length === 0) return getStudy(studyId);
  if (files.length === 1) return uploadDicom(studyId, files[0]);

  const batches: File[][] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE));
  }

  let done = 0;
  let lastResult: StudyOut | undefined;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const batchLabel = batches.length > 1 ? ` (part ${b + 1}/${batches.length})` : "";
    onProgress?.(done, files.length); // report before so UI shows "zipping…" label if needed

    const zipBlob = await bundleAsZip(batch);
    const form = new FormData();
    form.append(
      "file",
      new File([zipBlob], "batch.zip", { type: "application/zip" }),
    );
    lastResult = await apiFetch<StudyOut>(
      `${BASE}/studies/${studyId}/upload-dicom`,
      { method: "POST", body: form },
      2,
    );
    done += batch.length;
    onProgress?.(done, files.length);
    void batchLabel; // suppress unused-var warning
  }

  studyCache.set(`study:${studyId}`, lastResult!, TTL.study);
  fileListCache.delete(`files:${studyId}`);
  studyListCache.invalidatePrefix("studies:");
  return lastResult!;
}

export async function updateStudy(
  studyId: string,
  payload: Partial<StudyUpdate>,
): Promise<StudyOut> {
  const study = await apiFetch<StudyOut>(`${BASE}/studies/${studyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  studyCache.set(`study:${studyId}`, study, TTL.study);
  studyListCache.invalidatePrefix("studies:");
  return study;
}

export async function deleteStudy(id: string): Promise<void> {
  await apiFetch<void>(`${BASE}/studies/${id}`, { method: "DELETE" });
  studyCache.delete(`study:${id}`);
  fileListCache.delete(`files:${id}`);
  studyListCache.invalidatePrefix("studies:");
}

// ─── Study reads ──────────────────────────────────────────────────────────────

export function listStudies(params?: {
  page?: number;
  page_size?: number;
  modality?: string;
  status?: string;
  urgent_only?: boolean;
}): Promise<StudyListOut> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.modality) q.set("modality", params.modality);
  if (params?.status) q.set("status", params.status);
  if (params?.urgent_only) q.set("urgent_only", "true");

  const cacheKey = `studies:${q.toString()}`;
  const cached = studyListCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return dedupe(cacheKey, async () => {
    const data = await apiFetch<StudyListOut>(`${BASE}/studies/?${q}`);
    studyListCache.set(cacheKey, data, TTL.studyList);
    for (const item of data.items) {
      studyCache.set(`study:${item.id}`, item, TTL.study);
    }
    return data;
  });
}

export function getStudy(studyId: string): Promise<StudyOut> {
  const cacheKey = `study:${studyId}`;
  const cached = studyCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return dedupe(cacheKey, async () => {
    const data = await apiFetch<StudyOut>(`${BASE}/studies/${studyId}`);
    studyCache.set(cacheKey, data, TTL.study);
    return data;
  });
}

// `series` selects one of the study's real DICOM series (see
// /studies/{id}/series — largest-first, 0 = default/primary), not an
// arbitrary equal-count chunk. Each series gets its own cache entry since
// they're genuinely different file sets now.
export function getDicomFileList(studyId: string, series: number = 0): Promise<string[]> {
  const cacheKey = `files:${studyId}:${series}`;
  const cached = fileListCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return dedupe(cacheKey, async () => {
    const data = await apiFetch<DicomFileListResponse>(
      `${BASE}/studies/${studyId}/files?series=${series}`,
      undefined,
      2,
    );
    const files = (data.files ?? []).filter((f: string) => f !== "DICOMDIR");
    fileListCache.set(cacheKey, files, TTL.fileList);
    return files;
  });
}

// The real series list for the sidebar (largest-first). Replaces the old
// static per-modality placeholder labels, which were generic copy
// unrelated to what was actually uploaded.
export function getStudySeries(studyId: string): Promise<SeriesInfo[]> {
  const cacheKey = `series:${studyId}`;
  const cached = seriesInfoCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return dedupe(cacheKey, async () => {
    const data = await apiFetch<StudySeriesResponse>(
      `${BASE}/studies/${studyId}/series`,
      undefined,
      2,
    );
    const series = data.series ?? [];
    seriesInfoCache.set(cacheKey, series, TTL.seriesInfo);
    return series;
  });
}

// ─── Prefetch helpers ─────────────────────────────────────────────────────────

export const prefetchStudy = (studyId: string) => void getStudy(studyId);
export const prefetchDicomFileList = (studyId: string) =>
  void getDicomFileList(studyId);

// ─── Cache management ─────────────────────────────────────────────────────────

export function invalidateStudyCache(studyId?: string): void {
  if (studyId) {
    studyCache.delete(`study:${studyId}`);
    fileListCache.invalidatePrefix(`files:${studyId}`);
    seriesInfoCache.delete(`series:${studyId}`);
    studyListCache.invalidatePrefix("studies:");
  } else {
    studyCache.clear();
    fileListCache.clear();
    seriesInfoCache.clear();
    studyListCache.clear();
  }
}
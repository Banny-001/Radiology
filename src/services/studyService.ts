const BASE = "/api/v1";

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Typed API error ─────────────────────────────────────────────────────────
// Carries the HTTP status so callers can branch on 401/403/404 etc. without
// string-matching error messages.

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Thin fetch wrapper.
// - Deserialises JSON on success.
// - Throws ApiError with status + body on HTTP errors.
// - Retries server errors (5xx) with exponential back-off; never retries 4xx.
async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  retries = 1,
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(300 * 2 ** (attempt - 1)); // 300 ms, 600 ms …
    try {
      const res = await fetch(url, options);
      if (res.ok) return res.json() as Promise<T>;

      const body = await res.text();
      // Client errors are deterministic — never worth retrying.
      if (res.status < 500) throw new ApiError(res.status, body);
      lastErr = new ApiError(res.status, body);
    } catch (err) {
      // Re-throw immediately for 4xx (ApiError thrown above) or abort errors.
      if (err instanceof ApiError) throw err;
      lastErr = err;
    }
  }

  throw lastErr;
}

// ─── TTL cache ───────────────────────────────────────────────────────────────
// Simple in-memory store keyed by string. Entries expire after `ttlMs`
// milliseconds and are evicted lazily on next read.

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

  // Remove all entries whose key starts with `prefix`.
  // Used to bust the study-list cache after any mutation.
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}

// ─── In-flight deduplication ─────────────────────────────────────────────────
// If two callers request the same resource simultaneously only one network
// request goes out; both await the same Promise. The entry is removed once
// the request settles (success or error) so a fresh fetch can be made later.
// This is the biggest win for DicomViewer, which currently fires getDicomFileList
// on every mount and every series switch.

const inFlight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const p = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

// ─── Cache instances + TTLs ───────────────────────────────────────────────────

const studyListCache = new TtlCache<StudyListOut>();
const studyCache = new TtlCache<StudyOut>();
const fileListCache = new TtlCache<string[]>();

const TTL = {
  studyList: 30_000, // 30 s  — worklist is polled-ish, keep fresh
  study: 60_000, // 1 min — single study metadata
  fileList: 5 * 60_000, // 5 min — file list is immutable after upload
} as const;

// ─── Study mutations ─────────────────────────────────────────────────────────

export async function createStudy(payload: StudyPayload): Promise<StudyOut> {
  const study = await apiFetch<StudyOut>(`${BASE}/studies/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // New study → bust list cache so worklist reflects it immediately.
  studyListCache.invalidatePrefix("studies:");
  // Warm single-study cache.
  studyCache.set(`study:${study.id}`, study, TTL.study);
  return study;
}

export async function uploadDicom(
  studyId: string,
  file: File,
): Promise<StudyOut> {
  const form = new FormData();
  form.append("file", file);
  const study = await apiFetch<StudyOut>(
    `${BASE}/studies/${studyId}/upload-dicom`,
    { method: "POST", body: form },
  );
  // File list changed — evict stale cache entries.
  studyCache.set(`study:${studyId}`, study, TTL.study);
  fileListCache.delete(`files:${studyId}`);
  studyListCache.invalidatePrefix("studies:");
  return study;
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
    // Warm individual study cache from the list payload — zero extra requests.
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

// ─── DICOM file list ──────────────────────────────────────────────────────────
// Most aggressively optimised endpoint:
//   1. Long TTL (files don't change after upload).
//   2. In-flight deduplication (DicomViewer re-mounts on every series switch).
//   3. Retry on transient server errors.

export function getDicomFileList(studyId: string): Promise<string[]> {
  const cacheKey = `files:${studyId}`;
  const cached = fileListCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return dedupe(cacheKey, async () => {
    const data = await apiFetch<DicomFileListResponse>(
      `${BASE}/studies/${studyId}/files`,
      undefined,
      2, // up to 2 retries for this critical path
    );
    const files = data.files ?? [];
    fileListCache.set(cacheKey, files, TTL.fileList);
    return files;
  });
}

// ─── Prefetch helpers ─────────────────────────────────────────────────────────
// Call these on hover/intent to warm the cache before navigation.
// Both are no-ops if data is already cached.

export const prefetchStudy = (studyId: string) => void getStudy(studyId);
export const prefetchDicomFileList = (studyId: string) =>
  void getDicomFileList(studyId);

// ─── Cache management ─────────────────────────────────────────────────────────
// Expose for use in dev tools or a "force refresh" UI button.

export function invalidateStudyCache(studyId?: string): void {
  if (studyId) {
    studyCache.delete(`study:${studyId}`);
    fileListCache.delete(`files:${studyId}`);
    studyListCache.invalidatePrefix("studies:");
  } else {
    studyCache.clear();
    fileListCache.clear();
    studyListCache.clear();
  }
}

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
      if (res.ok) return res.json() as Promise<T>;
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

const TTL = {
  studyList: 30_000,
  study: 60_000,
  fileList: 5 * 60_000,
} as const;

// ─── ZIP helper ───────────────────────────────────────────────────────────────
// Bundles multiple File objects into a single ZIP Blob using fflate's
// async `zip()` so the main thread is never blocked.

function bundleAsZip(files: File[]): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      // Read all files into Uint8Arrays in parallel
      const entries = await Promise.all(
        files.map(async (f) => {
          const buf = await f.arrayBuffer();
          return [f.name, new Uint8Array(buf)] as [string, Uint8Array];
        }),
      );

      // Build the fflate input map — DICOM files are already compressed
      // so store them without re-compression (level: 0) for max speed.
      const input: Record<string, [Uint8Array, { level: 0 }]> = {};
      for (const [name, data] of entries) {
        input[name] = [data, { level: 0 }];
      }

      zip(input, (err, data) => {
        if (err) return reject(err);
        resolve(new Blob([data], { type: "application/zip" }));
      });
    } catch (err) {
      reject(err);
    }
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

// ── Single-file upload (kept for backwards compat) ────────────────────────────
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

// ── Batch upload — ONE request regardless of file count ───────────────────────
// All files are zipped client-side and sent as a single multipart request.
// The backend's existing ZIP extraction handler unpacks them server-side.
// Reduces N upload-dicom requests to exactly 1.
export async function uploadDicomBatch(
  studyId: string,
  files: File[],
): Promise<StudyOut> {
  if (files.length === 0) return getStudy(studyId);

  // Single file — skip ZIP overhead, send directly
  if (files.length === 1) return uploadDicom(studyId, files[0]);

  const zipBlob = await bundleAsZip(files);
  const form = new FormData();
  form.append("file", new File([zipBlob], "batch.zip", { type: "application/zip" }));

  const study = await apiFetch<StudyOut>(
    `${BASE}/studies/${studyId}/upload-dicom`,
    { method: "POST", body: form },
    2, // retry up to 2x — single large upload is worth retrying
  );

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

export function getDicomFileList(studyId: string): Promise<string[]> {
  const cacheKey = `files:${studyId}`;
  const cached = fileListCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return dedupe(cacheKey, async () => {
    const data = await apiFetch<DicomFileListResponse>(
      `${BASE}/studies/${studyId}/files`,
      undefined,
      2,
    );
    const files = data.files ?? [];
    fileListCache.set(cacheKey, files, TTL.fileList);
    return files;
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
    fileListCache.delete(`files:${studyId}`);
    studyListCache.invalidatePrefix("studies:");
  } else {
    studyCache.clear();
    fileListCache.clear();
    studyListCache.clear();
  }
}
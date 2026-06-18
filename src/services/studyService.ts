// const BASE = "http://localhost:8000/api/v1";
const BASE = "/api/v1";
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

// ── Create a study record ────────────────────────────────────────────────────
export async function createStudy(payload: StudyPayload): Promise<StudyOut> {
  const res = await fetch(`${BASE}/studies/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Upload a .dcm file to an existing study ──────────────────────────────────
export async function uploadDicom(studyId: string, file: File): Promise<StudyOut> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/studies/${studyId}/upload-dicom`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── List studies ─────────────────────────────────────────────────────────────
export async function listStudies(params?: {
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
  const res = await fetch(`${BASE}/studies/?${q}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Get single study ─────────────────────────────────────────────────────────
export async function getStudy(studyId: string): Promise<StudyOut> {
  const res = await fetch(`${BASE}/studies/${studyId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Update study ─────────────────────────────────────────────────────────────
export async function updateStudy(studyId: string, payload: Partial<StudyUpdate>): Promise<StudyOut> {
  const res = await fetch(`${BASE}/studies/${studyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Get DICOM file list for a study ──────────────────────────────────────────
export async function getDicomFileList(studyId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/studies/${studyId}/files`);
  if (!res.ok) throw new Error(await res.text());
  const data: DicomFileListResponse = await res.json();
  return data.files || [];
}
export async function deleteStudy(id: string): Promise<void> {
  const res = await fetch(`${BASE}/studies/${id}`, { method: 'DELETE' })
  console.log('res',res);
  if (!res.ok) throw new Error('Delete failed')
}
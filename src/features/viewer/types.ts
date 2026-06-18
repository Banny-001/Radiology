// ─── Domain types ───────────────────────────────────────────────────────────

export interface UploadedFile {
  name: string;
  size: string;
  progress: number;
  done: boolean;
}

export interface PatientForm {
  patientName: string;
  patientId: string;
  dob: string;
  sex: string;
  modality: string;
  description: string;
  referringDoctor: string;
  institution: string;
  clinicalHistory: string;
  urgent: boolean;
}

export interface Device {
  name: string;
  location: string;
  ae: string;
  status: "online" | "idle";
  last: string;
}

export interface PacsField {
  label: string;
  value: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const EMPTY_FORM: PatientForm = {
  patientName: "",
  patientId: "",
  dob: "",
  sex: "",
  modality: "",
  description: "",
  referringDoctor: "",
  institution: "",
  clinicalHistory: "",
  urgent: false,
};

export const DEVICES: Device[] = [
  {
    name: "GE Revolution CT",
    location: "Radiology — Room 1",
    ae: "GE_CT_001",
    status: "online",
    last: "Today 09:14 AM",
  },
  {
    name: "Siemens Ysio X-Ray",
    location: "Casualty Department",
    ae: "SIEM_XRAY_01",
    status: "online",
    last: "Today 11:32 AM",
  },
  {
    name: "Philips Ingenia MRI 1.5T",
    location: "Radiology — Room 2",
    ae: "PHIL_MRI_001",
    status: "idle",
    last: "Yesterday 16:45 PM",
  },
];

export const PACS_FIELDS: PacsField[] = [
  { label: "AE Title", value: "RADIOGRAPHY" },
  { label: "IP Address / Hostname", value: "pacs.radiography.co.ke" },
  { label: "DICOM Port", value: "4242" },
  { label: "HTTP Port (WADO-RS)", value: "443" },
  { label: "Protocol", value: "DICOM C-STORE (SCU→SCP)" },
];

// ─── Shared style helpers ────────────────────────────────────────────────────

export const inputStyle = (hasError?: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "10px 14px",
  border: `1px solid ${hasError ? "#fca5a5" : "#e5e7eb"}`,
  borderRadius: "10px",
  fontSize: "14px",
  background: hasError ? "#fef2f2" : "#f9fafb",
  outline: "none",
  boxSizing: "border-box",
  color: "#111827",
});

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "6px",
};

export const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  border: "1px solid #f3f4f6",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  overflow: "hidden",
};
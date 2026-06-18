export type Role = 'radiologist' | 'radiographer' | 'referring_doctor' | 'admin'
export type Modality = 'CT' | 'MRI' | 'X-RAY' | 'ULTRASOUND' | 'PET' | 'MAMMOGRAPHY'
export type StudyStatus = 'UNREAD' | 'IN_PROGRESS' | 'REPORTED' | 'VERIFIED'
export type CommentType = 'clinical_note' | 'query' | 'urgent_flag' | 'additional_history' | 'acknowledged'

export interface Patient {
  id: string
  name: string
  patientId: string
  dob: string
  sex: 'M' | 'F' | 'Other'
}

export interface Comment {
  id: string
  authorName: string
  authorRole: Role
  type: CommentType
  message: string
  timestamp: string
}

export interface Study {
  id: string
  patient: Patient
  modality: Modality
  description: string
  referringDoctor: string
  assignedRadiologist: string | null
  institution: string
  receivedAt: string
  studyDate: string
  status: StudyStatus
  isUrgent: boolean
  dicomUid: string
  numberOfImages: number
  bodyPart: string
  clinicalHistory: string
  comments: Comment[]
  dicom_path?: string | null
}

export interface Report {
  id: string
  studyId: string
  radiologistName: string
  technique: string
  findings: string
  impression: string
  status: 'DRAFT' | 'SIGNED'
  signedAt: string | null
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  institution: string
  initials: string
}
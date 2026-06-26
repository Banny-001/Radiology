import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Study, Comment } from '../types'
import { listStudies, updateStudy } from '../services/studyService'

interface StudyContextType {
  studies: Study[]
  loading: boolean
  error: string | null
  refresh: () => void
  addComment: (studyId: string, comment: Omit<Comment, 'id'>) => void
  updateStudyStatus: (studyId: string, status: Study['status']) => void
}

const StudyContext = createContext<StudyContextType | null>(null)

// ── Map API response → frontend Study shape ──────────────────────────────────
function mapApiStudy(s: any): Study {
  return {
    id: s.id,
    patient: {
      id: s.patient_id,
      name: s.patient_name,
      patientId: s.patient_id,
      dob: s.date_of_birth ?? '1990-01-01',
      sex: s.sex ?? 'M',
    },
    modality: s.modality,
    description: s.description,
    bodyPart: s.description,
    // ── FIX: was `s.dicom_path ? 1 : 0` which always showed "1 image" for
    //    any study that had a dicom_path, and "0" for everything else.
    //    The API returns the real count in `number_of_images` — use that.
    numberOfImages: s.number_of_images ?? 0,
    referringDoctor: s.referring_doctor ?? '—',
    assignedRadiologist: null,
    institution: s.institution ?? '',
    status: s.status === 'pending'      ? 'UNREAD'
           : s.status === 'in_progress' ? 'IN_PROGRESS'
           : s.status === 'reported'    ? 'REPORTED'
           : 'VERIFIED',
    isUrgent: s.is_urgent,
    receivedAt: s.created_at,
    comments: [],
    studyDate: s.created_at,
    dicomUid: s.study_instance_uid ?? '',
    clinicalHistory: s.clinical_history ?? '',
    dicom_path: s.dicom_path ?? null,
  }
}

export function StudyProvider({ children }: { children: ReactNode }) {
  const [studies, setStudies]   = useState<Study[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  // Track whether an initial load has ever completed so background refreshes
  // don't flash the loading spinner — they update silently.
  const initialLoadDone = useRef(false)

  const fetchStudies = useCallback(async (background = false) => {
    // First load shows the spinner; subsequent refreshes update silently
    // so the worklist doesn't flicker while the upload completes.
    if (!background || !initialLoadDone.current) {
      setLoading(true)
    }
    setError(null)
    try {
      const data = await listStudies({ page_size: 100 })
      setStudies(data.items.map(mapApiStudy))
      initialLoadDone.current = true
    } catch (err: any) {
      setError(err.message ?? 'Failed to fetch studies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStudies()
  }, [fetchStudies])

  // `refresh` is called externally (e.g. after upload) — run as background
  // so the worklist updates without flashing a full loading state.
  const refresh = useCallback(() => {
    fetchStudies(/* background */ true)
  }, [fetchStudies])

  const addComment = (studyId: string, comment: Omit<Comment, 'id'>) => {
    setStudies(prev =>
      prev.map(s =>
        s.id === studyId
          ? { ...s, comments: [...s.comments, { ...comment, id: Date.now().toString() }] }
          : s
      )
    )
  }

  const updateStudyStatus = async (studyId: string, status: Study['status']) => {
    // Optimistic update
    setStudies(prev => prev.map(s => (s.id === studyId ? { ...s, status } : s)))

    const apiStatus = status === 'UNREAD'      ? 'pending'
                    : status === 'IN_PROGRESS'  ? 'in_progress'
                    : status === 'REPORTED'      ? 'reported'
                    : 'verified'
    try {
      await updateStudy(studyId, { status: apiStatus })
    } catch (err) {
      console.error('Failed to update status:', err)
      fetchStudies(true) // revert by re-fetching (silent — no loading flash)
    }
  }

  return (
    <StudyContext.Provider value={{ studies, loading, error, refresh, addComment, updateStudyStatus }}>
      {children}
    </StudyContext.Provider>
  )
}

export const useStudies = () => {
  const ctx = useContext(StudyContext)
  if (!ctx) throw new Error('useStudies must be used within StudyProvider')
  return ctx
}
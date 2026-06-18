import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Eye, RefreshCw, AlertTriangle, MessageCircle,
  Clock, Activity, CheckCircle, ClipboardList, FileEdit,
  ChevronRight, Trash2, X,
} from 'lucide-react'
import type { Modality, Study } from '../../../types'
import { useStudies } from '../../../context/StudyContext'
import { useAuth } from '../../../context/AuthContext'
import { deleteStudy } from '../../../services/studyService' // added

const MODALITY_COLORS: Record<Modality, { bg: string; text: string }> = {
  CT:          { bg: '#EBF3FF', text: '#1A73E8' },
  MRI:         { bg: '#F5F3FF', text: '#7c3aed' },
  'X-RAY':     { bg: '#F1F5F9', text: '#475569' },
  ULTRASOUND:  { bg: '#F0FDFA', text: '#0d9488' },
  PET:         { bg: '#FFF7ED', text: '#ea580c' },
  MAMMOGRAPHY: { bg: '#FDF4FF', text: '#a21caf' },
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  UNREAD:      { bg: '#FEF2F2', text: '#DC2626' },
  IN_PROGRESS: { bg: '#FFF7ED', text: '#EA580C' },
  REPORTED:    { bg: '#F0FDF4', text: '#16A34A' },
  VERIFIED:    { bg: '#EFF6FF', text: '#1A73E8' },
}

const STEP_KEYS: Study['status'][] = ['UNREAD', 'IN_PROGRESS', 'REPORTED', 'VERIFIED']

function StatusStepper({ status }: { status: Study['status'] }) {
  const idx = STEP_KEYS.indexOf(status)
  const color = STATUS_STYLES[status]?.text ?? '#6b7280'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '6px' }}>
      {STEP_KEYS.map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            border: `2px solid ${i <= idx ? color : '#d1d5db'}`,
            background: i <= idx ? color : '#fff',
          }} />
          {i < STEP_KEYS.length - 1 && (
            <div style={{ width: '12px', height: '2px', background: i < idx ? color : '#e5e7eb' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function ModalityBadge({ modality }: { modality: Modality }) {
  const c = MODALITY_COLORS[modality]
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: '6px',
      fontSize: '11px', fontWeight: 700, background: c.bg, color: c.text,
      whiteSpace: 'nowrap',
    }}>
      {modality}
    </span>
  )
}

function StatusBadge({ status }: { status: Study['status'] }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.UNREAD
  const label = status.replace('_', ' ')
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: '6px',
      fontSize: '11px', fontWeight: 600, background: s.bg, color: s.text,
      whiteSpace: 'nowrap',
    }}>
      {label.charAt(0) + label.slice(1).toLowerCase()}
    </span>
  )
}

function calcAge(dob: string) {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Today ${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
// added: keeps a destructive action behind an explicit confirm step so a
// misclick on the trash icon never permanently removes a study
function DeleteConfirmModal({
  study,
  deleting,
  onConfirm,
  onCancel,
}: {
  study: Study
  deleting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    // Backdrop
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* Dialog — stopPropagation so clicking inside doesn't dismiss */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '20px',
          padding: '28px 24px', maxWidth: '420px', width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: '#FEF2F2', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
          }}>
            <Trash2 size={20} color="#dc2626" />
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9ca3af', padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 700, color: '#111827' }}>
          Delete Study?
        </h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>
          This will permanently remove the study and all associated DICOM files from the PACS server. This action cannot be undone.
        </p>

        {/* Study summary chip */}
        <div style={{
          background: '#f9fafb', border: '1px solid #f3f4f6',
          borderRadius: '12px', padding: '12px 14px',
          marginBottom: '20px',
        }}>
          <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827', marginBottom: '3px' }}>
            {study.patient.name}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
            {study.patient.patientId} · {study.modality} · {study.description}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              flex: 1, padding: '11px', borderRadius: '12px',
              border: '1px solid #e5e7eb', background: '#fff',
              fontSize: '14px', fontWeight: 600, color: '#374151',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              flex: 1, padding: '11px', borderRadius: '12px',
              border: 'none',
              background: deleting ? '#fca5a5' : '#dc2626',
              fontSize: '14px', fontWeight: 600, color: '#fff',
              cursor: deleting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {deleting && (
              <div style={{
                width: '14px', height: '14px',
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', flexShrink: 0,
              }} />
            )}
            {deleting ? 'Deleting…' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function StudyListPage() {
  const { studies, loading, error, refresh } = useStudies()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [modFilter, setModFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // added: which study is queued for deletion + in-flight flag
  const [studyToDelete, setStudyToDelete] = useState<Study | null>(null)
  const [deleting, setDeleting] = useState(false)

  useState(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  })

  const filtered = useMemo(() => studies.filter(s => {
    if (user?.role === 'referring_doctor' && s.referringDoctor !== user.name) return false
    if (urgentOnly && !s.isUrgent) return false
    if (modFilter !== 'ALL' && s.modality !== modFilter) return false
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return s.patient.name.toLowerCase().includes(q) ||
        s.patient.patientId.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    }
    return true
  }), [studies, search, modFilter, statusFilter, urgentOnly, user])

  const canReport = user?.role === 'radiologist' || user?.role === 'admin'
  // show delete to any authenticated user — tighten to specific roles once RBAC is finalised
  const canDelete = !!user

  const handleRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  // added: confirmed delete — calls API, refreshes context, closes modal
  const handleDeleteConfirm = async () => {
    if (!studyToDelete || deleting) return
    setDeleting(true)
    try {
      await deleteStudy(studyToDelete.id)
      await refresh()
      setStudyToDelete(null)
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeleting(false)
    }
  }

  const stats = [
    { label: "Today's Studies", value: studies.length, icon: Activity, color: '#1A73E8', bg: '#EBF3FF' },
    { label: 'Pending', value: studies.filter(s => s.status === 'UNREAD' || s.status === 'IN_PROGRESS').length, icon: ClipboardList, color: '#EA580C', bg: '#FFF7ED' },
    { label: 'Completed', value: studies.filter(s => s.status === 'REPORTED' || s.status === 'VERIFIED').length, icon: CheckCircle, color: '#16A34A', bg: '#F0FDF4' },
    { label: 'Urgent', value: studies.filter(s => s.isUrgent).length, icon: AlertTriangle, color: '#DC2626', bg: '#FEF2F2' },
  ]

  const pad = isMobile ? '16px' : '32px'

  if (loading) return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: '12px', color: '#6b7280',
    }}>
      <RefreshCw size={28} color="#1A73E8" style={{ animation: 'spin 1s linear infinite' }} />
      <p style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>Loading studies...</p>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: '12px',
    }}>
      <AlertTriangle size={32} color="#dc2626" />
      <p style={{ fontSize: '14px', color: '#dc2626', fontWeight: 500, margin: 0 }}>{error}</p>
      <button
        onClick={handleRefresh}
        style={{
          padding: '8px 20px', borderRadius: '10px', border: 'none',
          background: '#1A73E8', color: '#fff', fontSize: '13px',
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  )

  return (
    <div style={{ padding: pad, background: '#F8FAFF', minHeight: '100%', boxSizing: 'border-box' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* added: delete confirmation modal — rendered at root level so it
          overlays everything correctly regardless of table scroll position */}
      {studyToDelete && (
        <DeleteConfirmModal
          study={studyToDelete}
          deleting={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => { if (!deleting) setStudyToDelete(null) }}
        />
      )}

      {/* Heading */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: '#111827', margin: 0 }}>
          Study Worklist
        </h2>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
          Studies received from {user?.institution ?? 'PACS'} imaging machines
        </p>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: '#fff', borderRadius: '14px',
            border: '1px solid #f3f4f6', padding: '16px',
            display: 'flex', alignItems: 'center', gap: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: s.bg, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
            }}>
              <s.icon size={20} color={s.color} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 700, color: s.color, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px', fontWeight: 500, lineHeight: 1.3 }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main card */}
      <div style={{
        background: '#fff', borderRadius: '16px',
        border: '1px solid #f3f4f6',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>
        {/* Search + controls */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <Search size={14} color="#9ca3af" style={{
              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search patient, ID, study..."
              style={{
                width: '100%', padding: '10px 16px 10px 34px',
                border: '1px solid #e5e7eb', borderRadius: '10px',
                fontSize: '14px', background: '#f9fafb', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleRefresh} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', padding: '9px', border: '1px solid #e5e7eb',
              borderRadius: '10px', fontSize: '13px', fontWeight: 500,
              color: '#374151', background: '#fff', cursor: 'pointer',
            }}>
              <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>
            <button onClick={() => setUrgentOnly(!urgentOnly)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', padding: '9px', borderRadius: '10px',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              border: urgentOnly ? 'none' : '1px solid #fecaca',
              background: urgentOnly ? '#ef4444' : '#fff',
              color: urgentOnly ? '#fff' : '#ef4444',
            }}>
              <AlertTriangle size={13} />
              URGENT
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
              Modality
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['ALL', 'CT', 'MRI', 'X-RAY', 'US'].map(m => {
                const key = m === 'US' ? 'ULTRASOUND' : m
                return (
                  <button key={m} onClick={() => setModFilter(key)} style={{
                    padding: '5px 12px', borderRadius: '20px', fontSize: '12px',
                    fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: modFilter === key ? '#1A73E8' : '#f3f4f6',
                    color: modFilter === key ? '#fff' : '#6b7280',
                  }}>
                    {m}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
              Status
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['ALL', 'UNREAD', 'IN PROG', 'REPORTED', 'VERIFIED'].map(s => {
                const key = s === 'IN PROG' ? 'IN_PROGRESS' : s
                return (
                  <button key={s} onClick={() => setStatusFilter(key)} style={{
                    padding: '5px 12px', borderRadius: '20px', fontSize: '12px',
                    fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: statusFilter === key ? '#1A73E8' : '#f3f4f6',
                    color: statusFilter === key ? '#fff' : '#6b7280',
                  }}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── MOBILE: Cards ──────────────────────────────────────────────────── */}
        {isMobile && (
          <div>
            {filtered.map(study => (
              <div
                key={study.id}
                onClick={() => navigate(`/viewer/${study.id}`)}
                style={{
                  padding: '16px',
                  borderBottom: '1px solid #f9fafb',
                  cursor: 'pointer',
                  borderLeft: study.isUrgent ? '4px solid #ef4444' : '4px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: '14px', marginBottom: '2px' }}>
                      {study.patient.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {study.patient.patientId} · {calcAge(study.patient.dob)}{study.patient.sex}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <ModalityBadge modality={study.modality} />
                    {study.isUrgent && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444' }}>URGENT</span>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: '#374151', fontWeight: 500, marginBottom: '4px' }}>
                  {study.description}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>
                  {study.referringDoctor} · {study.bodyPart} · {study.numberOfImages} imgs
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <StatusBadge status={study.status} />
                    <StatusStepper status={study.status} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {study.comments.length > 0 && (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: '3px',
                        fontSize: '12px', color: '#1A73E8', fontWeight: 600,
                        background: '#EBF3FF', padding: '3px 8px', borderRadius: '8px',
                      }}>
                        <MessageCircle size={11} />
                        {study.comments.length}
                      </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#9ca3af' }}>
                      <Clock size={11} />
                      {timeAgo(study.receivedAt)}
                    </div>
                  </div>
                </div>

                {/* Mobile action buttons */}
                <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/viewer/${study.id}`) }}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '6px',
                      padding: '10px', borderRadius: '10px', border: 'none',
                      background: '#1A73E8', color: '#fff',
                      fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Eye size={14} /> View
                  </button>
                  {canReport && (
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/viewer/${study.id}?tab=report`) }}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '6px',
                        padding: '10px', borderRadius: '10px',
                        border: '1px solid #e5e7eb', background: '#fff',
                        color: '#374151', fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <FileEdit size={14} /> Report
                    </button>
                  )}
                  {/* added: delete button on mobile — admin only */}
                  {canDelete && (
                    <button
                      onClick={e => { e.stopPropagation(); setStudyToDelete(study) }}
                      style={{
                        width: '42px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '10px', borderRadius: '10px',
                        border: '1px solid #fecaca', background: '#fff',
                        color: '#ef4444', cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                  {study.comments.length === 0 && !canReport && !canDelete && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#9ca3af' }}>
                      <ChevronRight size={16} color="#d1d5db" />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <Search size={32} color="#e5e7eb" style={{ margin: '0 auto 10px', display: 'block' }} />
                <p style={{ color: '#9ca3af', fontWeight: 500, fontSize: '14px' }}>No studies found</p>
              </div>
            )}

            <div style={{ padding: '10px 16px', fontSize: '12px', color: '#9ca3af', textAlign: 'center', borderTop: '1px solid #f9fafb' }}>
              {filtered.length} of {studies.length} studies
            </div>
          </div>
        )}

        {/* ── DESKTOP: Table ─────────────────────────────────────────────────── */}
        {!isMobile && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                  {['Patient', 'ID', 'Age/Sex', 'Modality', 'Description', 'Referring', 'Assigned', 'Received', 'Status', ''].map(h => (
                    <th key={h} style={{
                      padding: '12px 20px', textAlign: 'left',
                      fontSize: '11px', fontWeight: 700, color: '#9ca3af',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((study, idx) => (
                  <tr
                    key={study.id}
                    onClick={() => navigate(`/viewer/${study.id}`)}
                    style={{
                      borderBottom: '1px solid #f9fafb',
                      cursor: 'pointer',
                      background: idx % 2 === 0 ? '#fff' : '#fafafa',
                      borderLeft: study.isUrgent ? '4px solid #ef4444' : '4px solid transparent',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#EBF3FF')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}
                  >
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{study.patient.name}</div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{
                        fontSize: '12px', fontFamily: 'monospace', fontWeight: 500,
                        background: '#f3f4f6', color: '#6b7280', padding: '3px 8px', borderRadius: '6px',
                      }}>
                        {study.patient.patientId}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#374151', fontWeight: 500 }}>
                      {calcAge(study.patient.dob)}{study.patient.sex}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <ModalityBadge modality={study.modality} />
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: 500, color: '#1f2937' }}>{study.description}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                        {study.bodyPart} · {study.numberOfImages} imgs
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#6b7280', fontSize: '13px' }}>
                      {study.referringDoctor}
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '13px', color: '#6b7280' }}>
                      {study.assignedRadiologist ?? (
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        <Clock size={11} />
                        {timeAgo(study.receivedAt)}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <StatusBadge status={study.status} />
                      <StatusStepper status={study.status} />
                    </td>

                    {/* Actions cell — stopPropagation so row click doesn't fire */}
                    <td style={{ padding: '16px 20px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => navigate(`/viewer/${study.id}`)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '7px 14px', borderRadius: '10px', border: 'none',
                            background: '#1A73E8', color: '#fff', fontSize: '12px',
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <Eye size={13} /> View
                        </button>
                        {/* delete sits right next to View so it's always easy to find */}
                        {canDelete && (
                          <button
                            onClick={() => setStudyToDelete(study)}
                            title="Delete study"
                            style={{
                              padding: '7px', borderRadius: '10px',
                              border: '1px solid #fecaca', background: '#fff',
                              color: '#ef4444', cursor: 'pointer',
                              display: 'flex', alignItems: 'center',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = '#fff'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        {canReport && (
                          <button
                            onClick={() => navigate(`/viewer/${study.id}?tab=report`)}
                            style={{
                              padding: '7px', borderRadius: '10px',
                              border: '1px solid #e5e7eb', background: '#fff',
                              color: '#9ca3af', cursor: 'pointer',
                              display: 'flex', alignItems: 'center',
                            }}
                          >
                            <FileEdit size={14} />
                          </button>
                        )}
                        {study.comments.length > 0 && (
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '4px 10px', borderRadius: '10px',
                            background: '#EBF3FF', color: '#1A73E8',
                            fontSize: '12px', fontWeight: 600,
                          }}>
                            <MessageCircle size={11} />
                            {study.comments.length}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div style={{ padding: '80px 20px', textAlign: 'center' }}>
                <Search size={36} color="#e5e7eb" style={{ margin: '0 auto 12px', display: 'block' }} />
                <p style={{ color: '#9ca3af', fontWeight: 500 }}>No studies found</p>
                <p style={{ color: '#d1d5db', fontSize: '13px', marginTop: '4px' }}>Try adjusting your filters</p>
              </div>
            )}

            <div style={{
              padding: '12px 20px', borderTop: '1px solid #f9fafb',
              fontSize: '12px', color: '#9ca3af', textAlign: 'right',
            }}>
              Showing {filtered.length} of {studies.length} studies
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
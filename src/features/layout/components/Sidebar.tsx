import { NavLink, useNavigate } from 'react-router-dom'
import { Activity, LayoutGrid, Upload, FileText, LogOut, X } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'

const NAV = [
  { to: '/studies', icon: LayoutGrid, label: 'Study List' },
  { to: '/upload', icon: Upload, label: 'Upload Study' },
  { to: '/reports', icon: FileText, label: 'Reports' },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        style={{
          width: '220px',
          background: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 30,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.2s ease',
        }}
        className="lg:static lg:translate-x-0 lg:z-auto"
      >
        {/* Logo */}
        <div
          style={{
            height: '64px',
            padding: '0 20px',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: '#1A73E8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Activity size={17} color="white" />
            </div>
            <span
              style={{
                fontWeight: 700,
                fontSize: '16px',
                color: '#111827',
              }}
            >
              Radiography
            </span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden"
            style={{ color: '#9ca3af', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* User info */}
        {/* {user && (
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #f3f4f6',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#1A73E8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {user.initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#111827',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.name}
                </div>
                <div style={{ fontSize: '11px', color: '#1A73E8', fontWeight: 500 }}>
                  {user.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </div>
              </div>
            </div>
          </div>
        )} */}

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#1A73E8' : '#6b7280',
                background: isActive ? '#EBF3FF' : 'transparent',
                textDecoration: 'none',
                marginBottom: '2px',
                transition: 'all 0.15s ease',
              })}
            >
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* PACS status */}
        <div
          style={{
            margin: '0 12px 12px',
            padding: '10px 14px',
            borderRadius: '12px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#16a34a',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
              PACS Online
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>Orthanc v1.12</div>
          </div>
        </div>

        {/* Logout */}
        <div
          style={{
            padding: '12px',
            borderTop: '1px solid #f3f4f6',
          }}
        >
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#6b7280',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#f9fafb'
              e.currentTarget.style.color = '#111827'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#6b7280'
            }}
          >
            <LogOut size={17} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
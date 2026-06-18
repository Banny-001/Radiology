import { Menu, Bell, LogOut } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const ROLE_COLORS: Record<string, string> = {
  radiologist: '#16a34a',
  radiographer: '#1A73E8',
  referring_doctor: '#7c3aed',
  admin: '#0891b2',
}

const ROLE_LABELS: Record<string, string> = {
  radiologist: 'Radiologist',
  radiographer: 'Radiographer',
  referring_doctor: 'Referring Doctor',
  admin: 'Admin',
}

interface TopBarProps {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header
      style={{
        height: '64px',
        background: '#ffffff',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '16px',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden"
        style={{
          padding: '8px',
          borderRadius: '10px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: '#6b7280',
        }}
      >
        <Menu size={20} />
      </button>

      {/* Institution name — center */}
      <div
        style={{
          flex: 1,
          textAlign: 'center',
          display: 'none',
        }}
        className="lg:block"
      >
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
          }}
        >
          {user?.institution ?? 'Radiography'}
        </span>
      </div>

      {/* Right side */}
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {/* Bell */}
        <button
          style={{
            position: 'relative',
            padding: '8px',
            borderRadius: '10px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#6b7280',
          }}
        >
          <Bell size={19} />
          <span
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              width: '16px',
              height: '16px',
              background: '#ef4444',
              borderRadius: '50%',
              fontSize: '10px',
              color: 'white',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            3
          </span>
        </button>

        {/* User info + avatar */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{ textAlign: 'right' }}
              className="hidden sm:block"
            >
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#111827',
                  lineHeight: 1.2,
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: ROLE_COLORS[user.role],
                }}
              >
                {ROLE_LABELS[user.role]}
              </div>
            </div>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: ROLE_COLORS[user.role],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700,
                color: 'white',
                flexShrink: 0,
              }}
            >
              {user.initials}
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={() => { logout(); navigate('/login') }}
          style={{
            padding: '8px',
            borderRadius: '10px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#9ca3af',
          }}
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
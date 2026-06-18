import { NavLink } from 'react-router-dom'
import { LayoutGrid, Upload, FileText } from 'lucide-react'

const NAV = [
  { to: '/studies', icon: LayoutGrid, label: 'Studies' },
  { to: '/upload', icon: Upload, label: 'Upload' },
  { to: '/reports', icon: FileText, label: 'Reports' },
]

export default function MobileBottomNav() {
  return (
    <nav
      className="lg:hidden"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        zIndex: 10,
      }}
    >
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 0',
            gap: '3px',
            fontSize: '11px',
            fontWeight: 500,
            color: isActive ? '#1A73E8' : '#9ca3af',
            textDecoration: 'none',
            background: 'transparent',
          })}
        >
          {({ isActive }) => (
            <>
              <div
                style={{
                  padding: '4px 8px',
                  borderRadius: '10px',
                  background: isActive ? '#EBF3FF' : 'transparent',
                }}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
              </div>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
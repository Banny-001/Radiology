import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileBottomNav from './MobileBottomNav'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const isViewer = location.pathname.startsWith('/viewer')

  if (isViewer) return <Outlet />

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#F8FAFF',
      }}
    >
      {/* Desktop sidebar */}
      <div
        className="hidden lg:flex flex-col flex-shrink-0"
        style={{ width: '220px' }}
      >
        <Sidebar open={true} onClose={() => {}} />
      </div>

      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main
          style={{ flex: 1, overflowY: 'auto' }}
          className="pb-16 lg:pb-0"
        >
          <Outlet />
        </main>
        <MobileBottomNav />
      </div>
    </div>
  )
}
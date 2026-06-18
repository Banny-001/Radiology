import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { StudyProvider } from './context/StudyContext'
import LoginPage from './features/auth/components/LoginPage'
import AppLayout from './features/layout/components/AppLayout'
import StudyListPage from './features/studies/components/StudyListPage'
import UploadPage from './features/viewer/components/UploadPage'
import ViewerPage from './features/viewer/ViewerPage'


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/studies" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/studies" replace />} />
        <Route path="viewer/:id" element={<ViewerPage />} />
        <Route path="studies" element={<StudyListPage />} />
        <Route path="upload" element={<UploadPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StudyProvider>
          <AppRoutes />
        </StudyProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
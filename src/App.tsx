import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { StudyProvider } from "./context/StudyContext";

// ── Lazy-loaded routes ─────────────────────────────────────────────────────
// Each page chunk is fetched only when its route is first visited.
// ViewerPage is the heaviest (Cornerstone + DicomViewer), so lazy-loading it
// keeps the initial bundle lean and the login/worklist snappy.
const LoginPage = lazy(() => import("./features/auth/components/LoginPage"));
const AppLayout = lazy(() => import("./features/layout/components/AppLayout"));
const StudyListPage = lazy(
  () => import("./features/studies/components/StudyListPage"),
);
const UploadPage = lazy(
  () => import("./features/viewer/components/UploadPage"),
);
const ViewerPage = lazy(() => import("./features/viewer/ViewerPage"));

// ── Shared suspense fallbacks ──────────────────────────────────────────────
function PageShell() {
  return (
    <div
      style={{
        height: "100vh",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        color: "#4b5563",
        fontSize: "13px",
        fontFamily: "monospace",
      }}
    >
      <SpinnerRing />
      Loading…
    </div>
  );
}

function ViewerShell() {
  return (
    <div
      style={{
        height: "100vh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        color: "#4b5563",
        fontSize: "12px",
        fontFamily: "monospace",
      }}
    >
      <SpinnerRing size={32} />
      <span>Loading viewer…</span>
      <span style={{ fontSize: "10px", color: "#374151" }}>
        Initialising Cornerstone imaging engine
      </span>
    </div>
  );
}

function SpinnerRing({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1A73E8"
      strokeWidth={2.5}
      strokeLinecap="round"
      style={{ animation: "spin 0.9s linear infinite" }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="9" stroke="#1e293b" />
      <path d="M12 3 A9 9 0 0 1 21 12" />
    </svg>
  );
}

// ── Auth guard ─────────────────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ── Route tree ─────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Suspense fallback={<PageShell />}>
            {user ? <Navigate to="/studies" replace /> : <LoginPage />}
          </Suspense>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageShell />}>
              <AppLayout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/studies" replace />} />

        {/* Viewer gets its own heavier fallback — Cornerstone takes a moment */}
        <Route
          path="viewer/:id"
          element={
            <Suspense fallback={<ViewerShell />}>
              <ViewerPage />
            </Suspense>
          }
        />

        <Route
          path="studies"
          element={
            <Suspense fallback={<PageShell />}>
              <StudyListPage />
            </Suspense>
          }
        />

        <Route
          path="upload"
          element={
            <Suspense fallback={<PageShell />}>
              <UploadPage />
            </Suspense>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StudyProvider>
          <AppRoutes />
        </StudyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

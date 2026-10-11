import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function RequireAuth() {
  const { isAuthenticated, isLoading, status, refreshUser } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <main className="auth-loading" role="status">Checking your session…</main>;
  }

  if (status === "error") {
    return (
      <main className="auth-loading auth-loading-error">
        <p>We couldn’t reach the server to check your session.</p>
        <button type="button" onClick={() => refreshUser().catch(() => {})}>Try again</button>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default RequireAuth;

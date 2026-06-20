import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

/**
 * Wraps routes that require authentication.
 * - Renders nothing while the session is being resolved (avoids flash-redirect).
 * - Redirects unauthenticated users to /login, preserving the intended
 *   destination in location state so Login can send them back after sign-in.
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // session not resolved yet — hold render

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}   // Login can read this to redirect back
        replace
      />
    );
  }

  return <Outlet />;
}

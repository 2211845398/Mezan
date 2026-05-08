import { Navigate } from 'react-router-dom';

/**
 * Authenticated index `/`: unified role-aware dashboard at `/dashboard`.
 */
export default function HomePage() {
  return <Navigate to="/dashboard" replace />;
}

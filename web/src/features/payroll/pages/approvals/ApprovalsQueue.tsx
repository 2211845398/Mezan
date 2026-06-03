import { Navigate } from 'react-router-dom';

/** Legacy route: monthly payroll review lives under `/payroll/overview`. */
export default function ApprovalsQueue() {
  return <Navigate to="/payroll/overview" replace />;
}

import { Navigate } from 'react-router-dom';

export default function InventoryScansIndexRedirect() {
  return <Navigate to="/purchasing/invoice-match" replace />;
}

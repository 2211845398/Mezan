import { Navigate, useParams } from 'react-router-dom';

export default function InventoryScansDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <Navigate to="/purchasing/invoice-match" replace />;
  }
  return <Navigate to={`/purchasing/invoice-match/${id}`} replace />;
}

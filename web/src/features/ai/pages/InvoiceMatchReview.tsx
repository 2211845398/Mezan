import { Navigate } from 'react-router-dom';

/** Alias to the purchasing invoice-match queue (W-5.4); no duplicated logic. */
export default function InvoiceMatchReview() {
  return <Navigate to="/purchasing/invoice-match" replace />;
}

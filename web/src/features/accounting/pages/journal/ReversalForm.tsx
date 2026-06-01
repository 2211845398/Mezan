import { Navigate, useParams } from 'react-router-dom';

/** Legacy route: redirect to detail and open reversal dialog. */
export default function ReversalForm() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/accounting/journal" replace />;
  return (
    <Navigate
      to={`/accounting/journal/${id}`}
      replace
      state={{ openReverse: true }}
    />
  );
}

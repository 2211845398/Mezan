import { Navigate, useLocation, useParams } from 'react-router-dom';

/** Maps legacy `/crm/discounts/new` and `/crm/discounts/:id/edit` to query-driven dialog on the list. */
export default function DiscountsQueryRedirect() {
  const location = useLocation();
  const { discountId } = useParams<{ discountId?: string }>();

  if (location.pathname.endsWith('/new')) {
    return <Navigate to="/crm/discounts?new=1" replace />;
  }

  const id = discountId ? Number.parseInt(discountId, 10) : NaN;
  if (Number.isFinite(id) && id > 0) {
    return <Navigate to={`/crm/discounts?edit=${id}`} replace />;
  }

  return <Navigate to="/crm/discounts" replace />;
}

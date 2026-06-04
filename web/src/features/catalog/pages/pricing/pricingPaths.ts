const CATALOG_BASE = '/catalog/pricing';
const ACCOUNTING_BASE = '/accounting/pricing-evaluation';

export function pricingListBasePath(pathname: string): string {
  return pathname.startsWith('/accounting') ? ACCOUNTING_BASE : CATALOG_BASE;
}

export function buildPricingDetailPath(
  basePath: string,
  productId: number,
  variantId: number,
  listParams: URLSearchParams,
): string {
  const qs = new URLSearchParams();
  const branchId = listParams.get('branch_id');
  if (branchId) qs.set('branch_id', branchId);
  const q = listParams.get('q');
  if (q) qs.set('return_q', q);
  const page = listParams.get('page');
  if (page && page !== '1') qs.set('return_page', page);
  if (listParams.get('needs_pricing_only') === '0') {
    qs.set('return_needs_pricing_only', '0');
  }
  const query = qs.toString();
  return `${basePath}/${productId}/${variantId}${query ? `?${query}` : ''}`;
}

export function buildPricingListPath(basePath: string, detailParams: URLSearchParams): string {
  const qs = new URLSearchParams();
  const branchId = detailParams.get('branch_id');
  if (branchId) qs.set('branch_id', branchId);
  const q = detailParams.get('return_q');
  if (q) qs.set('q', q);
  const page = detailParams.get('return_page');
  if (page && page !== '1') qs.set('page', page);
  if (detailParams.get('return_needs_pricing_only') === '0') {
    qs.set('needs_pricing_only', '0');
  }
  const query = qs.toString();
  return `${basePath}${query ? `?${query}` : ''}`;
}

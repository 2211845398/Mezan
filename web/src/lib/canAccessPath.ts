/*
 * Post-login path permission check. Mirrors RequirePermission rules on guarded
 * routes so `?next=` cannot land a user on a page they cannot access.
 */

type PathRule = {
  test: (pathname: string) => boolean;
  resource: string;
  action: string;
};

/** Longest / most specific rules first. */
const PATH_RULES: PathRule[] = [
  { test: (p) => p === '/' || p === '/dashboard' || p === '/profile' || p === '/select-branch', resource: '', action: '' },
  { test: (p) => p.startsWith('/admin/users/new'), resource: 'users', action: 'create' },
  { test: (p) => /^\/admin\/users\/\d+/.test(p), resource: 'users', action: 'read' },
  { test: (p) => p.startsWith('/admin/users'), resource: 'users', action: 'read' },
  { test: (p) => p.startsWith('/admin/roles'), resource: 'roles', action: 'read' },
  { test: (p) => p.startsWith('/admin/branches'), resource: 'branches', action: 'read' },
  { test: (p) => p.startsWith('/admin/terminals'), resource: 'terminals', action: 'read' },
  { test: (p) => p.startsWith('/admin/backups'), resource: 'backups', action: 'read' },
  { test: (p) => p.startsWith('/admin/notifications'), resource: 'notifications', action: 'read' },
  { test: (p) => p.startsWith('/notifications'), resource: 'notifications', action: 'read' },
  { test: (p) => p === '/pos/register', resource: 'pos_carts', action: 'update' },
  { test: (p) => p === '/pos/close', resource: 'pos_shifts', action: 'close' },
  { test: (p) => p.startsWith('/pos/invoices'), resource: 'sales_invoices', action: 'read' },
  { test: (p) => p.startsWith('/pos'), resource: 'pos_shifts', action: 'read' },
  { test: (p) => p.includes('/catalog/products/new'), resource: 'catalog', action: 'create' },
  { test: (p) => /\/catalog\/products\/\d+\/edit/.test(p), resource: 'catalog', action: 'update' },
  { test: (p) => p.startsWith('/catalog'), resource: 'catalog', action: 'read' },
  { test: (p) => p.includes('/inventory/adjustments/new'), resource: 'stock_adjustments', action: 'create' },
  { test: (p) => p.startsWith('/inventory/adjustments'), resource: 'stock_adjustments', action: 'read' },
  { test: (p) => p.startsWith('/inventory/transfers'), resource: 'inventory', action: 'read' },
  { test: (p) => p.startsWith('/inventory/scans'), resource: 'invoice_scans', action: 'read' },
  { test: (p) => p.startsWith('/inventory'), resource: 'inventory', action: 'read' },
  { test: (p) => p.includes('/purchasing/orders/new'), resource: 'purchase_orders', action: 'create' },
  { test: (p) => p.startsWith('/purchasing/suppliers/new'), resource: 'suppliers', action: 'create' },
  { test: (p) => p.startsWith('/purchasing/suppliers'), resource: 'suppliers', action: 'read' },
  { test: (p) => p.startsWith('/purchasing'), resource: 'purchase_orders', action: 'read' },
  { test: (p) => p.includes('/hr/employees/new'), resource: 'employees', action: 'create' },
  { test: (p) => p.startsWith('/hr'), resource: 'employees', action: 'read' },
  { test: (p) => p.startsWith('/payroll'), resource: 'payroll', action: 'read' },
  { test: (p) => p.includes('/accounting/journal/new'), resource: 'journal_entries', action: 'create' },
  { test: (p) => p.startsWith('/accounting/chart-accounts'), resource: 'chart_accounts', action: 'read' },
  { test: (p) => p.startsWith('/accounting'), resource: 'journal_entries', action: 'read' },
  { test: (p) => p.includes('/crm/customers/new'), resource: 'customers', action: 'create' },
  { test: (p) => p.startsWith('/crm/customers'), resource: 'customers', action: 'read' },
  { test: (p) => p.startsWith('/crm/loyalty'), resource: 'loyalty', action: 'read' },
  { test: (p) => p.startsWith('/crm/discounts'), resource: 'discounts', action: 'read' },
  { test: (p) => p.startsWith('/crm'), resource: 'customers', action: 'read' },
  { test: (p) => p.startsWith('/marketing/advisory'), resource: 'marketing_advisory', action: 'run' },
  { test: (p) => p.startsWith('/marketing/campaigns'), resource: 'ai_advisory', action: 'run' },
  { test: (p) => p.startsWith('/marketing/sales-invoices'), resource: 'sales_invoices', action: 'read' },
  { test: (p) => p.startsWith('/marketing'), resource: 'analytics', action: 'read' },
  { test: (p) => p.startsWith('/ai'), resource: 'ai_advisory', action: 'run' },
];

function permissionKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}

export function canAccessPath(
  rawPath: string,
  permissions: ReadonlySet<string> | Iterable<string>,
): boolean {
  const pathname = rawPath.split('?')[0] ?? rawPath;
  const permSet =
    permissions instanceof Set ? permissions : new Set(Array.from(permissions));

  for (const rule of PATH_RULES) {
    if (!rule.test(pathname)) continue;
    if (!rule.resource) return true;
    return permSet.has(permissionKey(rule.resource, rule.action));
  }

  // Unguarded authenticated routes (e.g. future pages): allow.
  return true;
}

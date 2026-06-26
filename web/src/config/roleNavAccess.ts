/** Role codes blocked from personal leave request UI (`/hr/leave`). */
export const PERSONAL_LEAVE_BLOCKED_ROLE_CODES = ['OWNER', 'ADMIN'] as const;

/** Pricing & inventory valuation: owner, admin, accountant only. */
export const PRICING_EVALUATION_ROLE_CODES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;

/** Correspondence inbox: owner and department managers who receive staff messages. */
export const CORRESPONDENCE_INBOX_ROLE_CODES = [
  'OWNER',
  'IT_ADMIN',
  'HR_MANAGER',
  'WAREHOUSE_MANAGER',
] as const;

/** Mirrors `STAFF_SELF_SERVICE_ANY` in app/api/deps.py (correspondence API gate). */
export const CORRESPONDENCE_SELF_SERVICE_PERMISSIONS = [
  { resource: 'employees', action: 'read' },
  { resource: 'pos_shifts', action: 'read' },
  { resource: 'catalog', action: 'read' },
  { resource: 'customers', action: 'read' },
  { resource: 'accounting', action: 'read' },
  { resource: 'users', action: 'read' },
  { resource: 'sales_invoices', action: 'read' },
] as const;

/** Targeted campaign advisor: marketing roles and global admins only. */
export const MARKETING_CAMPAIGN_ROLE_CODES = [
  'OWNER',
  'ADMIN',
  'MARKETING_ADMIN',
  'MARKETING_MANAGER',
] as const;

export function isPersonalLeaveBlocked(roleCodes: readonly string[]): boolean {
  const have = new Set(roleCodes.map((c) => String(c).toUpperCase()));
  return PERSONAL_LEAVE_BLOCKED_ROLE_CODES.some((c) => have.has(c));
}

export function hasPricingEvaluationRole(roleCodes: readonly string[]): boolean {
  const have = new Set(roleCodes.map((c) => String(c).toUpperCase()));
  return PRICING_EVALUATION_ROLE_CODES.some((c) => have.has(c));
}

export function hasCorrespondenceInboxAccess(roleCodes: readonly string[]): boolean {
  const have = new Set(roleCodes.map((c) => String(c).toUpperCase()));
  return CORRESPONDENCE_INBOX_ROLE_CODES.some((c) => have.has(c));
}

export function hasMarketingCampaignAccess(roleCodes: readonly string[]): boolean {
  const have = new Set(roleCodes.map((c) => String(c).toUpperCase()));
  if (have.has('HR_MANAGER')) return false;
  return MARKETING_CAMPAIGN_ROLE_CODES.some((c) => have.has(c));
}

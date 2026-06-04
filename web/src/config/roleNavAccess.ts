/** Role codes blocked from personal leave request UI (`/hr/leave`). */
export const PERSONAL_LEAVE_BLOCKED_ROLE_CODES = ['OWNER', 'ADMIN'] as const;

/** Pricing & inventory valuation: owner, admin, accountant only. */
export const PRICING_EVALUATION_ROLE_CODES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;

export function isPersonalLeaveBlocked(roleCodes: readonly string[]): boolean {
  const have = new Set(roleCodes.map((c) => String(c).toUpperCase()));
  return PERSONAL_LEAVE_BLOCKED_ROLE_CODES.some((c) => have.has(c));
}

export function hasPricingEvaluationRole(roleCodes: readonly string[]): boolean {
  const have = new Set(roleCodes.map((c) => String(c).toUpperCase()));
  return PRICING_EVALUATION_ROLE_CODES.some((c) => have.has(c));
}

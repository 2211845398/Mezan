import { describe, expect, it } from 'vitest';

import { resolveRoleDashboardKind } from '@/config/resolveRoleDashboardKind';

describe('resolveRoleDashboardKind', () => {
  it('prefers OWNER and ADMIN as executive', () => {
    expect(resolveRoleDashboardKind(['MARKETING_MANAGER', 'OWNER'])).toBe('executive');
    expect(resolveRoleDashboardKind(['ACCOUNTANT', 'ADMIN'])).toBe('executive');
  });

  it('maps MARKETING_MANAGER to marketing even with analytics-heavy roles absent', () => {
    expect(resolveRoleDashboardKind(['MARKETING_MANAGER'])).toBe('marketing');
  });

  it('orders HR before accountant when both present', () => {
    expect(resolveRoleDashboardKind(['ACCOUNTANT', 'HR_MANAGER'])).toBe('hr');
  });

  it('maps staff roles', () => {
    expect(resolveRoleDashboardKind(['CASHIER'])).toBe('staff');
    expect(resolveRoleDashboardKind(['FLOOR_STAFF'])).toBe('staff');
  });

  it('returns fallback for unknown codes', () => {
    expect(resolveRoleDashboardKind([])).toBe('fallback');
    expect(resolveRoleDashboardKind(['WAREHOUSE_MANAGER'])).toBe('fallback');
  });
});

import { describe, expect, it } from 'vitest';

import { canAccess, filterNav } from '@/config/navigationFilter';
import { navigation } from '@/config/navigation';

describe('navigationFilter', () => {
  const has = (resource: string, action: string) =>
    resource === 'employees' && action === 'read';

  it('hides leave nav for OWNER and ADMIN role codes', () => {
    const hr = navigation.find((n) => n.key === 'hr');
    const leave = hr?.children?.find((c) => c.key === 'hr-leave');
    expect(leave).toBeDefined();
    expect(canAccess(leave!, has, ['OWNER'])).toBe(false);
    expect(canAccess(leave!, has, ['ADMIN'])).toBe(false);
    expect(canAccess(leave!, has, ['ACCOUNTANT'])).toBe(true);
  });

  it('shows register-customer nav without customers:read', () => {
    const hasCreate = (resource: string, action: string) =>
      resource === 'customers' && action === 'create';
    const filtered = filterNav(navigation, hasCreate, []);
    const crm = filtered.find((n) => n.key === 'crm');
    expect(crm?.children?.some((c) => c.key === 'crm-customers-new')).toBe(true);
    expect(crm?.children?.some((c) => c.key === 'crm-customers')).toBe(false);
  });

  it('hides customer directory for marketing and floor staff role codes', () => {
    const hasRead = (resource: string, action: string) =>
      resource === 'customers' && action === 'read';
    const crm = navigation.find((n) => n.key === 'crm');
    const list = crm?.children?.find((c) => c.key === 'crm-customers');
    expect(canAccess(list!, hasRead, ['MARKETING_MANAGER'])).toBe(false);
    expect(canAccess(list!, hasRead, ['FLOOR_STAFF'])).toBe(false);
    expect(canAccess(list!, hasRead, ['CASHIER'])).toBe(true);
  });
});

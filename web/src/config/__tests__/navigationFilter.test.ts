import { describe, expect, it } from 'vitest';

import { canAccess, filterNav } from '@/config/navigationFilter';
import { navigation } from '@/config/navigation';

describe('navigationFilter', () => {
  const has = (resource: string, action: string) =>
    resource === 'employees' && action === 'read';

  it('shows leave nav for OWNER and ADMIN with employees read', () => {
    const hr = navigation.find((n) => n.key === 'hr');
    const leave = hr?.children?.find((c) => c.key === 'hr-leave');
    expect(leave).toBeDefined();
    expect(canAccess(leave!, has, ['OWNER'])).toBe(true);
    expect(canAccess(leave!, has, ['ADMIN'])).toBe(true);
    expect(canAccess(leave!, has, ['HR_MANAGER'])).toBe(true);
  });

  it('hides pricing evaluation for roles outside owner/admin/accountant', () => {
    const hasPricing = (resource: string, action: string) =>
      resource === 'accounting' && action === 'update';
    const accounting = navigation.find((n) => n.key === 'accounting');
    const pricing = accounting?.children?.find((c) => c.key === 'accounting-pricing-evaluation');
    expect(pricing).toBeDefined();
    expect(canAccess(pricing!, hasPricing, ['HR_MANAGER'])).toBe(false);
    expect(canAccess(pricing!, hasPricing, ['ACCOUNTANT'])).toBe(true);
  });

  it('hides marketing campaigns for HR_MANAGER even with ai_advisory permission', () => {
    const hasAi = (resource: string, action: string) =>
      resource === 'ai_advisory' && action === 'run';
    const marketing = navigation.find((n) => n.key === 'marketing');
    const campaigns = marketing?.children?.find((c) => c.key === 'marketing-campaigns');
    expect(campaigns).toBeDefined();
    expect(canAccess(campaigns!, hasAi, ['HR_MANAGER'])).toBe(false);
    expect(canAccess(campaigns!, hasAi, ['MARKETING_MANAGER'])).toBe(true);
    expect(canAccess(campaigns!, hasAi, ['ADMIN'])).toBe(true);
  });

  it('shows correspondence for manager recipient roles with self-service permission', () => {
    const hasEmployees = (resource: string, action: string) =>
      resource === 'employees' && action === 'read';
    const correspondence = navigation.find((n) => n.key === 'correspondence');
    expect(correspondence).toBeDefined();
    expect(canAccess(correspondence!, hasEmployees, ['OWNER'])).toBe(true);
    expect(canAccess(correspondence!, hasEmployees, ['IT_ADMIN'])).toBe(true);
    expect(canAccess(correspondence!, hasEmployees, ['HR_MANAGER'])).toBe(true);
    expect(canAccess(correspondence!, hasEmployees, ['WAREHOUSE_MANAGER'])).toBe(true);
    expect(canAccess(correspondence!, hasEmployees, ['ACCOUNTANT'])).toBe(false);
    expect(canAccess(correspondence!, hasEmployees, ['CASHIER'])).toBe(false);
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

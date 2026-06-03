import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { BranchRead, UserRead } from '../../types';
import { userRowBranchFilterValue, userRowRoleFilterValue, userRowStatusFilterValue } from '../userListSearch';

const tAr = ((key: string, opts?: { defaultValue?: string }) => {
  if (key === 'users.user_status.active') return 'نشط';
  if (key === 'roles.codes.HR_MANAGER') return 'مدير الموارد البشرية';
  return opts?.defaultValue ?? key;
}) as TFunction<'admin'>;

const tEn = ((key: string, opts?: { defaultValue?: string }) => {
  if (key === 'users.user_status.active') return 'Active';
  if (key === 'roles.codes.HR_MANAGER') return 'HR Manager';
  return opts?.defaultValue ?? key;
}) as TFunction<'admin'>;

describe('userListSearch', () => {
  it('status filter value includes Arabic and English labels plus raw code', () => {
    const row = { status: 'active' } as UserRead;
    const hay = userRowStatusFilterValue(row, tAr, tEn);
    expect(hay).toContain('active');
    expect(hay).toContain('نشط');
    expect(hay).toContain('Active');
  });

  it('role filter value includes codes and both locale labels', () => {
    const map = new Map<number, string>([[1, 'HR_MANAGER']]);
    const hay = userRowRoleFilterValue(1, map, tAr, tEn);
    expect(hay).toContain('HR_MANAGER');
    expect(hay).toContain('مدير الموارد البشرية');
    expect(hay).toContain('HR Manager');
  });

  it('branch filter value includes code, name, id, and label', () => {
    const branches: BranchRead[] = [
      {
        id: 5,
        code: 'WH1',
        name: 'Main Warehouse',
        address: null,
        timezone: 'UTC',
        is_active: true,
        archived_at: null,
      } as BranchRead,
    ];
    const row = { branch_id: 5 } as UserRead;
    const hay = userRowBranchFilterValue(row, branches);
    expect(hay).toContain('WH1');
    expect(hay).toContain('Main Warehouse');
    expect(hay).toContain('5');
  });
});

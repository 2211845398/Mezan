import { beforeAll, describe, expect, it } from 'vitest';

import i18n from '@/i18n';

import { payslipEmployeeDisplay, payslipStatusLabel } from '../payslipLabels';

describe('payslipLabels', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('ar');
  });

  it('payslipEmployeeDisplay prefers full name', () => {
    expect(
      payslipEmployeeDisplay({
        employee_profile_id: 4,
        user_full_name: 'سعيد مسعود',
        user_email: 'saad@gmail.com',
      }),
    ).toBe('سعيد مسعود');
  });

  it('payslipStatusLabel translates draft in Arabic', () => {
    const label = payslipStatusLabel('draft', i18n.getFixedT('ar', 'payroll'));
    expect(label).toContain('مسودة');
    expect(label).not.toBe('draft');
  });
});

import i18n from '@/i18n';

import { localizePrepareFailure } from '../prepareFailureMessages';

describe('localizePrepareFailure', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('ar');
  });

  it('translates by stable code', () => {
    const msg = localizePrepareFailure(
      { employee_profile_id: 1, message: 'Employee has no weekly work schedule', code: 'payroll_no_schedule' },
      i18n.getFixedT('ar', 'payroll'),
    );
    expect(msg).toContain('جدول عمل أسبوعي');
    expect(msg).not.toContain('Employee has no');
  });

  it('translates legacy English message without code', () => {
    const msg = localizePrepareFailure(
      {
        employee_profile_id: 1,
        message: 'Net amount cannot be negative for this period (check attendance and absences)',
      },
      i18n.getFixedT('ar', 'payroll'),
    );
    expect(msg).toContain('الصافي سالب');
  });
});

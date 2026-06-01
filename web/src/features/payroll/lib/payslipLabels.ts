import type { TFunction } from 'i18next';

export function payslipEmployeeDisplay(row: {
  user_full_name?: string | null;
  user_email?: string | null;
  employee_profile_id: number;
}): string {
  const name = row.user_full_name?.trim();
  if (name) return name;
  const email = row.user_email?.trim();
  if (email) return email;
  return `#${row.employee_profile_id}`;
}

export function payslipStatusLabel(status: string, t: TFunction<'payroll'>): string {
  if (status === 'draft') return t('status.draft');
  if (status === 'approved') return t('status.approved');
  if (status === 'no_payslip') return t('overview.payslip_status.no_payslip');
  if (status === 'paid') return t('overview.payslip_status.paid', { defaultValue: status });
  return t(`overview.payslip_status.${status}`, { defaultValue: status });
}

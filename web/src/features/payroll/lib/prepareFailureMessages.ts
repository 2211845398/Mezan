import type { TFunction } from 'i18next';

/** Legacy English API messages → stable i18n keys under `errors.prepare.*`. */
const LEGACY_MESSAGE_TO_CODE: Record<string, string> = {
  'Employee has no branch assigned': 'payroll_no_branch',
  'Employee has no weekly work schedule': 'payroll_no_schedule',
  'Either base_salary or hourly_rate (or hourly_rate_override) must be set to compute payroll':
    'payroll_no_pay_rate',
  'Net amount cannot be negative for this period (check attendance and absences)':
    'payroll_negative_net',
  'Net amount cannot be negative': 'payroll_negative_net',
  'Net amount cannot be negative after recalculation': 'payroll_negative_net',
  'Payslip amounts must satisfy gross = deductions + net': 'payroll_unbalanced_payslip',
};

export type PrepareFailure = {
  employee_profile_id: number;
  message: string;
  code?: string | null;
};

export function localizePrepareFailure(
  failure: PrepareFailure,
  t: TFunction<'payroll'>,
): string {
  const code = failure.code?.trim() || LEGACY_MESSAGE_TO_CODE[failure.message];
  if (code) {
    const key = `errors.prepare.${code}` as const;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return failure.message;
}

export function localizePrepareFailures(
  failures: PrepareFailure[],
  t: TFunction<'payroll'>,
  max = 3,
): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const f of failures) {
    const line = localizePrepareFailure(f, t);
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= max) break;
  }
  return lines.join('\n');
}

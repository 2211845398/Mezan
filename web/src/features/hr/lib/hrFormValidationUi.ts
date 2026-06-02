import type { FieldError, FieldErrors, FieldValues } from 'react-hook-form';
import type { TFunction } from 'i18next';

export const EMPLOYEE_DATA_FIELD_ORDER = [
  'subject_first_name',
  'subject_father_name',
  'subject_family_name',
  'subject_role_code',
  'subject_branch_id',
  'identity_document_type',
  'identity_document_number',
  'hire_date',
  'base_salary',
  'hourly_rate',
  'bank_account',
  'annual_leave_entitlement_days',
] as const;

export const EMPLOYEE_FORM_FIELD_ORDER = [
  'user_id',
  'hire_date',
  'base_salary',
  'hourly_rate',
  'bank_account',
] as const;

export function hrFieldErrorMessage(
  error: FieldError | undefined,
  t: TFunction<'hr'>,
  tc: TFunction<'common'>,
): string | undefined {
  if (!error?.message) return undefined;
  const msg = String(error.message);
  switch (msg) {
    case 'base_or_hourly':
      return t('employees.form.base_or_hourly');
    case 'iban_invalid':
      return t('employees.form.iban_invalid');
    case 'national_id_invalid':
      return t('employees.form.national_id_invalid');
    case 'annual_leave_invalid':
      return t('employees.form.annual_leave_invalid');
    default:
      if (msg.toLowerCase().includes('required') || msg === 'Required') {
        return tc('errors.validation_required');
      }
      return msg;
  }
}

/** Returns unique toast messages for invalid submit (in display order). */
export function collectHrValidationToasts(
  errs: FieldErrors<FieldValues>,
  t: TFunction<'hr'>,
  tc: TFunction<'common'>,
  fieldOrder: readonly string[] = EMPLOYEE_DATA_FIELD_ORDER,
): string[] {
  const messages: string[] = [];
  const seen = new Set<string>();
  for (const key of fieldOrder) {
    const err = errs[key] as FieldError | undefined;
    const text = hrFieldErrorMessage(err, t, tc);
    if (text && !seen.has(text)) {
      seen.add(text);
      messages.push(text);
    }
  }
  for (const key of Object.keys(errs)) {
    if (fieldOrder.includes(key)) continue;
    const err = errs[key] as FieldError | undefined;
    const text = hrFieldErrorMessage(err, t, tc);
    if (text && !seen.has(text)) {
      seen.add(text);
      messages.push(text);
    }
  }
  return messages;
}

import type { FieldError } from 'react-hook-form';
import type { TFunction } from 'i18next';

import { LOGIN_ERROR } from '@/features/auth/pages/loginSchema';

export const LOGIN_FIELD_ORDER = ['email', 'password'] as const;

export function loginFieldErrorMessage(
  error: FieldError | undefined,
  t: TFunction<'auth'>,
): string | undefined {
  if (!error?.message) return undefined;
  const code = String(error.message);
  switch (code) {
    case LOGIN_ERROR.EMAIL_REQUIRED:
      return t('login.email_required');
    case LOGIN_ERROR.EMAIL_INVALID:
      return t('login.email_invalid');
    case LOGIN_ERROR.PASSWORD_REQUIRED:
      return t('login.password_required');
    case LOGIN_ERROR.PASSWORD_TOO_SHORT:
      return t('login.password_too_short');
    default:
      return code;
  }
}

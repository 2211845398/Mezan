import type { FieldError } from 'react-hook-form';
import type { TFunction } from 'i18next';
import { z } from 'zod';

/** Stable Zod error codes for profile password change. */
export const PROFILE_PASSWORD_ERROR = {
  REQUIRED: 'field_required',
  TOO_SHORT: 'new_password_too_short',
  MISMATCH: 'password_mismatch',
} as const;

export const PROFILE_PASSWORD_FIELD_ORDER = [
  'current_password',
  'new_password',
  'confirm_new_password',
] as const;

export function buildProfilePasswordSchema() {
  return z
    .object({
      current_password: z.string().min(1, PROFILE_PASSWORD_ERROR.REQUIRED),
      new_password: z
        .string()
        .min(1, PROFILE_PASSWORD_ERROR.REQUIRED)
        .min(8, PROFILE_PASSWORD_ERROR.TOO_SHORT),
      confirm_new_password: z.string().min(1, PROFILE_PASSWORD_ERROR.REQUIRED),
    })
    .refine((val) => val.new_password === val.confirm_new_password, {
      message: PROFILE_PASSWORD_ERROR.MISMATCH,
      path: ['confirm_new_password'],
    });
}

export type ProfilePasswordFormValues = z.infer<ReturnType<typeof buildProfilePasswordSchema>>;

export function profilePasswordFieldErrorMessage(
  error: FieldError | undefined,
  t: TFunction<'auth'>,
  tCommon: TFunction<'common'>,
): string | undefined {
  if (!error?.message) return undefined;
  const code = String(error.message);
  switch (code) {
    case PROFILE_PASSWORD_ERROR.REQUIRED:
      return tCommon('errors.validation_required');
    case PROFILE_PASSWORD_ERROR.TOO_SHORT:
      return t('profile.new_password_too_short');
    case PROFILE_PASSWORD_ERROR.MISMATCH:
      return t('profile.password_mismatch');
    default:
      return code;
  }
}

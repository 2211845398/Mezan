import { z } from 'zod';

/** Stable error codes stored in Zod messages; mapped to i18n in loginFormValidationUi. */
export const LOGIN_ERROR = {
  EMAIL_REQUIRED: 'email_required',
  EMAIL_INVALID: 'email_invalid',
  PASSWORD_REQUIRED: 'password_required',
  PASSWORD_TOO_SHORT: 'password_too_short',
} as const;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, LOGIN_ERROR.EMAIL_REQUIRED)
    .email(LOGIN_ERROR.EMAIL_INVALID),
  password: z
    .string()
    .min(1, LOGIN_ERROR.PASSWORD_REQUIRED)
    .min(8, LOGIN_ERROR.PASSWORD_TOO_SHORT),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

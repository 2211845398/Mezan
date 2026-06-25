import { z } from 'zod';

/** Stable error codes stored in Zod messages; mapped to i18n in loginFormValidationUi. */
export const LOGIN_ERROR = {
  EMAIL_REQUIRED: 'email_required',
  PASSWORD_REQUIRED: 'password_required',
} as const;

export const loginSchema = z.object({
  email: z.string().trim().min(1, LOGIN_ERROR.EMAIL_REQUIRED),
  password: z.string().min(1, LOGIN_ERROR.PASSWORD_REQUIRED),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { type FieldError, type FieldErrors, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthFieldError } from '@/features/auth/components/AuthFieldError';
import { login as loginApi } from '@/features/auth/api';
import {
  LOGIN_FIELD_ORDER,
  loginFieldErrorMessage,
} from '@/features/auth/lib/loginFormValidationUi';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { finalizeAuthSession } from '@/lib/finalizeAuthSession';
import { PasswordInput } from '@/components/ui/password-input';
import { MEZ_AUTH_INPUT_CLASS } from '@/lib/fieldFocus';
import { handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import { canAccessPath } from '@/lib/canAccessPath';
import { focusFirstFormError, useFormValidationDisplay } from '@/lib/formValidation';
import { sanitizeNextPath } from '@/lib/nextPath';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/utils';

import { classifyLoginError } from './loginErrors';
import { type LoginFormValues, loginSchema } from './loginSchema';

function resolvePostLoginPath(
  nextRaw: string | null,
  permissions: Set<string>,
  roleCodes: readonly string[],
): string {
  if (roleCodes.includes('ATTENDANCE_KIOSK')) {
    return '/attendance-kiosk';
  }
  const target = sanitizeNextPath(nextRaw);
  if (target === '/') return '/dashboard';
  return canAccessPath(target, permissions, roleCodes) ? target : '/dashboard';
}

function rootCredentialsError(root: unknown): FieldError | undefined {
  if (root == null || typeof root !== 'object') return undefined;
  const credentials = (root as Record<string, unknown>).credentials;
  if (credentials != null && typeof credentials === 'object' && 'message' in credentials) {
    return credentials as FieldError;
  }
  return undefined;
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { t: tAuth } = useTranslation('auth');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextRaw = searchParams.get('next');
  const status = useAuthStore((s) => s.status);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const { errors, showError, invalidClass } = useFormValidationDisplay(form.control);
  const credentialsError = rootCredentialsError(errors.root);
  const hasCredentialsError = Boolean(credentialsError?.message);

  const permissions = useAuthStore((s) => s.permissions);
  const roleCodes = useAuthStore((s) => s.roleCodes);
  const user = useAuthStore((s) => s.user);

  const clearFieldError = useCallback(
    (field: 'email' | 'password') => {
      form.clearErrors(field);
      form.clearErrors('root.credentials');
    },
    [form],
  );

  useEffect(() => {
    if (status !== 'authenticated' || !useAuthStore.getState().permissionsLoaded) {
      return;
    }
    if (user?.must_change_password) {
      navigate('/change-password-required', { replace: true });
      return;
    }
    navigate(resolvePostLoginPath(nextRaw, permissions, roleCodes), { replace: true });
  }, [status, navigate, nextRaw, permissions, roleCodes, user?.must_change_password]);

  async function onSubmit(values: LoginFormValues) {
    form.clearErrors('root.credentials');

    try {
      const tokens = await loginApi({ email: values.email, password: values.password });

      if (tokens.requires_2fa && tokens.challenge_token) {
        const next = nextRaw ? `?next=${encodeURIComponent(nextRaw)}` : '';
        navigate(`/two-factor-verify${next}`, {
          replace: true,
          state: { challengeToken: tokens.challenge_token },
        });
        return;
      }

      const { me, permSet, roleCodes } = await finalizeAuthSession(tokens);

      if (me.must_change_password) {
        navigate('/change-password-required', { replace: true });
        return;
      }

      notify.success(t('auth:login.success'));
      navigate(resolvePostLoginPath(nextRaw, permSet, roleCodes), { replace: true });
    } catch (err) {
      const key = classifyLoginError(err);
      if (key === 'auth:errors.invalid_credentials') {
        (document.activeElement as HTMLElement | null)?.blur();
        form.setError('root.credentials', {
          type: 'server',
          message: t('auth:login.invalid_credentials'),
        });
        return;
      }
      if (key) {
        notify.error(t(key));
      }
    }
  }

  const submitting = form.formState.isSubmitting;

  const onInvalid = (errs: FieldErrors<LoginFormValues>) => {
    focusFirstFormError(form, errs, LOGIN_FIELD_ORDER);
  };

  const { ref: emailRef, ...emailRegister } = form.register('email', {
    onChange: () => clearFieldError('email'),
  });

  const { ref: passwordRef, ...passwordRegister } = form.register('password', {
    onChange: () => clearFieldError('password'),
  });

  const emailMessage = loginFieldErrorMessage(errors.email, tAuth) ?? '';
  const passwordMessage = loginFieldErrorMessage(errors.password, tAuth) ?? '';

  const emailInvalid = showError('email') || hasCredentialsError;
  const passwordInvalid = showError('password') || hasCredentialsError;

  const inputTransition = 'transition-all duration-300 ease-in-out';

  return (
    <div className="space-y-6" dir={i18n.dir()}>
      <div className="space-y-1 text-start">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:login.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:login.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        onKeyDown={handleFormEnterSubmit}
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit, onInvalid)(e);
        }}
        noValidate
      >
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="login-email">
            {t('auth:login.email')}
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            dir="ltr"
            className={cn(
              MEZ_AUTH_INPUT_CLASS,
              inputTransition,
              invalidClass('email'),
              hasCredentialsError && 'border-destructive',
            )}
            aria-invalid={emailInvalid || undefined}
            aria-describedby={showError('email') ? 'login-email-error' : undefined}
            {...emailRegister}
            ref={emailRef}
            onFocus={() => clearFieldError('email')}
          />
          <AuthFieldError
            id="login-email-error"
            message={emailMessage}
            visible={showError('email')}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="login-password">
            {t('auth:login.password')}
          </label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            className={cn(
              inputTransition,
              invalidClass('password'),
              hasCredentialsError && 'border-destructive',
            )}
            aria-invalid={passwordInvalid || undefined}
            aria-describedby={showError('password') ? 'login-password-error' : undefined}
            {...passwordRegister}
            ref={passwordRef}
            onFocus={() => clearFieldError('password')}
          />
          <AuthFieldError
            id="login-password-error"
            message={passwordMessage}
            visible={showError('password')}
          />
        </div>

        <AuthFieldError
          message={credentialsError?.message ?? ''}
          visible={hasCredentialsError}
        />

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('auth:login.submit')}
        </button>
      </form>

      <div className="flex items-center justify-start text-sm">
        <Link
          to="/forgot-password"
          className="text-primary underline-offset-4 hover:underline"
        >
          {t('auth:login.forgot_password')}
        </Link>
      </div>
    </div>
  );
}

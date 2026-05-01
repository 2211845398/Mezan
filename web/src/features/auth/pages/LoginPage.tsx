import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { getMe, getMyPermissions, getMyRoles, login as loginApi } from '@/features/auth/api';
import {
  type AuthUser,
  useAuthStore,
} from '@/features/auth/stores/authStore';
import { sanitizeNextPath } from '@/lib/nextPath';
import { notify } from '@/lib/toast';

import { classifyLoginError } from './loginErrors';
import { type LoginFormValues,loginSchema } from './loginSchema';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextRaw = searchParams.get('next');
  const status = useAuthStore((s) => s.status);
  const setStatus = useAuthStore((s) => s.setStatus);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setRefreshToken = useAuthStore((s) => s.setRefreshToken);
  const setUser = useAuthStore((s) => s.setUser);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const setRoleCodes = useAuthStore((s) => s.setRoleCodes);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (status === 'authenticated') {
      navigate(sanitizeNextPath(nextRaw), { replace: true });
    }
  }, [status, navigate, nextRaw]);

  async function onSubmit(values: LoginFormValues) {
    try {
      const tokens = await loginApi({ email: values.email, password: values.password });
      setAccessToken(tokens.access_token);
      setRefreshToken(tokens.refresh_token);

      // Fetch user + permissions BEFORE flipping status to 'authenticated' so
      // guards never see a half-resolved permission set on the first render
      // after login (W-2 bug 2).
      const [me, perms, roles] = await Promise.all([getMe(), getMyPermissions(), getMyRoles()]);
      setUser(me as AuthUser);
      setPermissions(perms);
      setRoleCodes(roles.codes);
      setStatus('authenticated');

      navigate(sanitizeNextPath(nextRaw), { replace: true });
    } catch (err) {
      const key = classifyLoginError(err);
      notify.error(t(key));
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <div className="space-y-6" dir="auto">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:login.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:login.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit)(e);
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
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-invalid={form.formState.errors.email ? true : undefined}
            {...form.register('email')}
          />
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive" role="alert">
              {t('auth:login.email_invalid')}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="login-password">
            {t('auth:login.password')}
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-invalid={form.formState.errors.password ? true : undefined}
            {...form.register('password')}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive" role="alert">
              {t('auth:login.password_required')}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('auth:login.submit')}
        </button>
      </form>

      <div className="flex items-center justify-center text-sm">
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

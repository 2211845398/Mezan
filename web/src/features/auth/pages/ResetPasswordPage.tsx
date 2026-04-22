import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';

import { isAxiosError } from '@/api/client';
import { confirmPasswordReset } from '@/features/auth/api';
import { notify } from '@/lib/toast';

const schema = z
  .object({
    password: z.string().min(8),
    confirm: z.string().min(8),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'mismatch',
  });
type Values = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  async function onSubmit(values: Values) {
    if (!token) return;
    try {
      await confirmPasswordReset({ token, new_password: values.password });
      setDone(true);
      notify.success(t('auth:reset.success'));
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 400) {
        notify.error(t('auth:reset.invalid_token'));
      } else {
        notify.error(t('auth:errors.generic'));
      }
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">{t('auth:reset.missing_token')}</h1>
        <a href="/login" className="text-sm text-primary hover:underline">
          {t('auth:actions.back_to_login')}
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:reset.success')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:reset.redirecting')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:reset.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:reset.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit)(e);
        }}
        noValidate
      >
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="reset-password">
            {t('auth:reset.new_password')}
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-invalid={form.formState.errors.password ? true : undefined}
            {...form.register('password')}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive" role="alert">
              {t('auth:reset.too_short')}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="reset-confirm">
            {t('auth:reset.confirm_password')}
          </label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-invalid={form.formState.errors.confirm ? true : undefined}
            {...form.register('confirm')}
          />
          {form.formState.errors.confirm ? (
            <p className="text-xs text-destructive" role="alert">
              {t('auth:reset.mismatch')}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          {form.formState.isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {t('auth:reset.submit')}
        </button>
      </form>
    </div>
  );
}

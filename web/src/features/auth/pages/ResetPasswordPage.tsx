import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { confirmPasswordReset } from '@/features/auth/api';
import { MEZ_AUTH_INPUT_CLASS } from '@/lib/fieldFocus';
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

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => navigate('/login', { replace: true }), 2000);
      return () => clearTimeout(t);
    }
  }, [done, navigate]);

  async function onSubmit(values: Values) {
    if (!token) return;
    try {
      await confirmPasswordReset({ token, new_password: values.password });
      setDone(true);
      notify.success(t('auth:reset.success'));
    } catch (err) {
      notifyApiError(err, t('auth:reset.invalid_token'));
    }
  }

  const onInvalid = (errs: FieldErrors<Values>) => {
    if (errs.password) {
      notify.error(t('auth:reset.too_short'));
      void form.setFocus('password');
      return;
    }
    if (errs.confirm?.message === 'mismatch') {
      notify.error(t('auth:reset.mismatch'));
      void form.setFocus('confirm');
      return;
    }
    notify.error(t('common:errors.validation_required'));
  };

  if (!token) {
    return (
      <div className="space-y-6 text-center" dir="auto">
        <h1 className="text-xl font-semibold">{t('auth:reset.missing_token')}</h1>
        <Link to="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          {t('auth:actions.back_to_login')}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-6 text-center" dir="auto">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('auth:reset.success')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth:reset.redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="auto">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:reset.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:reset.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit, onInvalid)(e);
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
            className={MEZ_AUTH_INPUT_CLASS}
            aria-invalid={form.formState.errors.password ? true : undefined}
            {...form.register('password')}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="reset-confirm">
            {t('auth:reset.confirm_password')}
          </label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            className={MEZ_AUTH_INPUT_CLASS}
            aria-invalid={form.formState.errors.confirm ? true : undefined}
            {...form.register('confirm')}
          />
        </div>

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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

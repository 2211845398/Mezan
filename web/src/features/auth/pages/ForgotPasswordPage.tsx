import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { isAxiosError } from '@/api/client';
import { requestPasswordReset } from '@/features/auth/api';
import { MEZ_AUTH_INPUT_CLASS } from '@/lib/fieldFocus';
import { notify } from '@/lib/toast';

const schema = z.object({
  email: z.string().trim().email(),
});
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: Values) {
    try {
      const { challenge_token } = await requestPasswordReset({ email: values.email });
      navigate('/password-reset-otp', {
        replace: true,
        state: { challengeToken: challenge_token },
      });
    } catch (err) {
      if (isAxiosError(err)) {
        notify.error(t('auth:errors.generic'));
      } else {
        notify.error(t('auth:errors.unexpected'));
      }
    }
  }

  const onInvalid = (errs: FieldErrors<Values>) => {
    if (errs.email) {
      notify.error(t('auth:login.email_invalid'));
      void form.setFocus('email');
      return;
    }
    notify.error(t('common:errors.validation_required'));
  };

  return (
    <div className="space-y-6" dir="auto">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:forgot.title')}</h1>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit, onInvalid)(e);
        }}
        noValidate
      >
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="forgot-email">
            {t('auth:login.email')}
          </label>
          <input
            id="forgot-email"
            type="email"
            dir="ltr"
            autoComplete="username"
            className={MEZ_AUTH_INPUT_CLASS}
            aria-invalid={form.formState.errors.email ? true : undefined}
            {...form.register('email')}
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
          {t('auth:forgot.submit')}
        </button>
      </form>

      <div className="flex items-center justify-center text-sm">
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          {t('auth:actions.back_to_login')}
        </Link>
      </div>
    </div>
  );
}

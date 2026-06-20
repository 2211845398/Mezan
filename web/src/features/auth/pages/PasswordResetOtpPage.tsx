import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Controller, type FieldErrors, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { OtpCodeInput } from '@/components/ui/otp-code-input';
import { verifyPasswordResetOtp } from '@/features/auth/api';
import { notify } from '@/lib/toast';

const schema = z.object({
  code: z
    .string()
    .length(6, 'invalid')
    .regex(/^\d{6}$/, 'invalid'),
});

type Values = z.infer<typeof schema>;

export default function PasswordResetOtpPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const challengeToken =
    (location.state as { challengeToken?: string } | null)?.challengeToken ?? '';

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  async function onSubmit(values: Values) {
    if (!challengeToken) {
      notify.error(t('auth:reset_otp.missing_challenge'));
      return;
    }
    try {
      const { reset_token } = await verifyPasswordResetOtp({
        challenge_token: challengeToken,
        code: values.code,
      });
      navigate('/password-reset-new', {
        replace: true,
        state: { resetToken: reset_token },
      });
    } catch (err) {
      notifyApiError(err, t('auth:reset_otp.invalid'));
    }
  }

  const onInvalid = (errs: FieldErrors<Values>) => {
    if (errs.code) {
      notify.error(t('auth:reset_otp.invalid'));
      void form.setFocus('code');
    }
  };

  if (!challengeToken) {
    return (
      <div className="space-y-4 text-center" dir="auto">
        <p className="text-sm text-muted-foreground">{t('auth:reset_otp.missing_challenge')}</p>
        <Link to="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
          {t('auth:actions.back_to_login')}
        </Link>
      </div>
    );
  }

  const submitting = form.formState.isSubmitting;

  return (
    <div className="space-y-6" dir="auto">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:reset_otp.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:reset_otp.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit, onInvalid)(e);
        }}
        noValidate
      >
        <div className="space-y-3">
          <label className="text-sm font-medium" htmlFor="reset-otp-code">
            {t('auth:reset_otp.code_label')}
          </label>
          <Controller
            name="code"
            control={form.control}
            render={({ field, fieldState }) => (
              <OtpCodeInput
                id="reset-otp-code"
                value={field.value}
                onChange={field.onChange}
                autoFocus
                aria-label={t('auth:reset_otp.code_label')}
                aria-invalid={fieldState.invalid}
              />
            )}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || form.watch('code').length !== 6}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('auth:reset_otp.submit')}
        </button>
      </form>
    </div>
  );
}

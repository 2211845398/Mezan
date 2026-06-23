import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Controller, type FieldErrors, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { OtpCodeInput } from '@/components/ui/otp-code-input';
import { verifyTwoFactor } from '@/features/auth/api';
import { finalizeAuthSession } from '@/lib/finalizeAuthSession';
import { canAccessPath } from '@/lib/canAccessPath';
import { sanitizeNextPath } from '@/lib/nextPath';
import { notify } from '@/lib/toast';

const schema = z.object({
  code: z
    .string()
    .length(6, 'invalid')
    .regex(/^\d{6}$/, 'invalid'),
});

type Values = z.infer<typeof schema>;

export default function TwoFactorVerifyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const nextRaw = searchParams.get('next');
  const challengeToken =
    (location.state as { challengeToken?: string } | null)?.challengeToken ??
    searchParams.get('challenge') ??
    '';

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  async function onSubmit(values: Values) {
    if (!challengeToken) {
      notify.error(t('auth:two_factor.missing_challenge'));
      return;
    }
    try {
      const tokens = await verifyTwoFactor({
        challenge_token: challengeToken,
        code: values.code,
      });
      const { me, permSet, roleCodes } = await finalizeAuthSession(tokens);
      if (me.must_change_password) {
        navigate('/change-password-required', { replace: true });
        return;
      }
      notify.success(t('auth:login.success'));
      const target = sanitizeNextPath(nextRaw);
      const path =
        target === '/'
          ? '/dashboard'
          : canAccessPath(target, permSet, roleCodes)
            ? target
            : '/dashboard';
      navigate(path, { replace: true });
    } catch {
      notify.error(t('auth:two_factor.invalid_code'));
    }
  }

  const onInvalid = (errs: FieldErrors<Values>) => {
    if (errs.code) {
      notify.error(t('auth:two_factor.invalid_code'));
      void form.setFocus('code');
    }
  };

  if (!challengeToken) {
    return (
      <div className="space-y-4 text-center" dir="auto">
        <p className="text-sm text-muted-foreground">{t('auth:two_factor.missing_challenge')}</p>
        <Link to="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          {t('auth:actions.back_to_login')}
        </Link>
      </div>
    );
  }

  const submitting = form.formState.isSubmitting;

  return (
    <div className="space-y-6" dir="auto">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:two_factor.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:two_factor.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit, onInvalid)(e);
        }}
        noValidate
      >
        <div className="space-y-3">
          <label className="text-sm font-medium" htmlFor="otp-code">
            {t('auth:two_factor.code_label')}
          </label>
          <Controller
            name="code"
            control={form.control}
            render={({ field, fieldState }) => (
              <OtpCodeInput
                id="otp-code"
                value={field.value}
                onChange={field.onChange}
                autoFocus
                aria-label={t('auth:two_factor.code_label')}
                aria-invalid={fieldState.invalid}
              />
            )}
          />
        </div>
        <button
          type="submit"
          disabled={submitting || form.watch('code').length !== 6}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('auth:two_factor.submit')}
        </button>
      </form>
    </div>
  );
}

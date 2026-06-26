import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { changeRequiredPassword } from '@/features/auth/api';
import { PasswordInput } from '@/components/ui/password-input';
import { applyFullAuthSession } from '@/lib/authSessionHydrate';
import { notify } from '@/lib/toast';

const schema = z
  .object({
    current_password: z.string().min(1),
    new_password: z.string().min(8),
    confirm: z.string().min(8),
  })
  .refine((v) => v.new_password === v.confirm, {
    path: ['confirm'],
    message: 'mismatch',
  });

type Values = z.infer<typeof schema>;

export default function RequiredPasswordChangePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  });

  async function onSubmit(values: Values) {
    try {
      const me = await changeRequiredPassword({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      await applyFullAuthSession(me);
      notify.success(t('auth:required_password.success'));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      notifyApiError(err, t('auth:required_password.failed'));
    }
  }

  const onInvalid = (errs: FieldErrors<Values>) => {
    if (errs.current_password) {
      notify.error(t('auth:required_password.current_required'));
      void form.setFocus('current_password');
      return;
    }
    if (errs.new_password) {
      notify.error(t('auth:required_password.too_short'));
      void form.setFocus('new_password');
      return;
    }
    if (errs.confirm?.message === 'mismatch') {
      notify.error(t('auth:reset.mismatch'));
      void form.setFocus('confirm');
    }
  };

  const submitting = form.formState.isSubmitting;

  return (
    <div className="space-y-6" dir="auto">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:required_password.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:required_password.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit, onInvalid)(e);
        }}
        noValidate
      >
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="req-current">
            {t('auth:profile.current_password')}
          </label>
          <PasswordInput
            id="req-current"
            autoComplete="current-password"
            {...form.register('current_password')}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="req-new">
            {t('auth:profile.new_password')}
          </label>
          <PasswordInput
            id="req-new"
            autoComplete="new-password"
            {...form.register('new_password')}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="req-confirm">
            {t('auth:profile.confirm_new_password')}
          </label>
          <PasswordInput
            id="req-confirm"
            autoComplete="new-password"
            {...form.register('confirm')}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('auth:required_password.submit')}
        </button>
      </form>
    </div>
  );
}

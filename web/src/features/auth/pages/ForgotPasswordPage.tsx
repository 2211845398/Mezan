import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { requestPasswordReset } from '@/features/auth/api';

const schema = z.object({
  email: z.string().trim().email(),
});
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: Values) {
    // Backend answer is intentionally uniform whether the email exists or
    // not; we just flip the UI to the "check your inbox" state.
    await requestPasswordReset({ email: values.email });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {t('auth:forgot.sent_title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('auth:forgot.sent_body')}</p>
        <a
          href="/login"
          className="inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('auth:actions.back_to_login')}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:forgot.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:forgot.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit)(e);
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
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-invalid={form.formState.errors.email ? true : undefined}
            {...form.register('email')}
          />
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive" role="alert">
              {t('auth:login.email_invalid')}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {form.formState.isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {t('auth:forgot.submit')}
        </button>
      </form>

      <div className="flex items-center justify-center text-sm">
        <a href="/login" className="text-primary underline-offset-4 hover:underline">
          {t('auth:actions.back_to_login')}
        </a>
      </div>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { z } from 'zod';

import { isAxiosError } from '@/api/client';
import { completeCustomerOnboarding } from '@/features/auth/api';
import { notify } from '@/lib/toast';

/*
 * Public onboarding page — no authentication required. Consumes the existing
 * `POST /api/v1/customers/onboarding/complete` endpoint (app/api/v1/customers.py).
 */

const schema = z.object({
  full_name: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
});
type Values = z.infer<typeof schema>;

export default function OnboardingCompletePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '' },
  });

  async function onSubmit(values: Values) {
    if (!token) return;
    try {
      const body: {
        token: string;
        full_name?: string | null;
        email?: string | null;
      } = { token };
      if (values.full_name) body.full_name = values.full_name;
      if (values.email) body.email = values.email;
      await completeCustomerOnboarding(body);
      setDone(true);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 400) {
        notify.error(t('auth:onboarding.invalid_token'));
      } else {
        notify.error(t('auth:errors.generic'));
      }
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">{t('auth:onboarding.missing_token')}</h1>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {t('auth:onboarding.success_title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('auth:onboarding.success_body')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('auth:onboarding.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth:onboarding.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit)(e);
        }}
        noValidate
      >
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="onboarding-name">
            {t('auth:onboarding.full_name')}
          </label>
          <input
            id="onboarding-name"
            type="text"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...form.register('full_name')}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="onboarding-email">
            {t('auth:login.email')}
          </label>
          <input
            id="onboarding-email"
            type="email"
            dir="ltr"
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
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          {form.formState.isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {t('auth:onboarding.submit')}
        </button>
      </form>
    </div>
  );
}

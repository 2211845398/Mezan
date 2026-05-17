import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { completeCustomerOnboarding } from '@/features/auth/api';
import { zodOptionalNonEmptyEmail } from '@/lib/validation/contact';

/**
 * Public onboarding page — no authentication required. Consumes the existing
 * `POST /api/v1/customers/onboarding/complete` endpoint.
 */

function buildOnboardingSchema(emailInvalid: string) {
  return z.object({
    first_name: z.string().trim().optional(),
    father_name: z.string().trim().optional(),
    family_name: z.string().trim().optional(),
    email: zodOptionalNonEmptyEmail(emailInvalid),
  });
}

type Values = z.infer<ReturnType<typeof buildOnboardingSchema>>;

export default function OnboardingCompletePage() {
  const { t } = useTranslation();
  const { t: tCrm } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState(false);
  const schema = useMemo(() => buildOnboardingSchema(tc('errors.validation_email')), [tc]);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { first_name: '', father_name: '', family_name: '', email: '' },
  });

  async function onSubmit(values: Values) {
    if (!token) return;
    try {
      await completeCustomerOnboarding({
        token,
        first_name: values.first_name?.trim() ? values.first_name.trim() : null,
        father_name: values.father_name?.trim() ? values.father_name.trim() : null,
        family_name: values.family_name?.trim() ? values.family_name.trim() : null,
        email: values.email?.trim() ? values.email.trim() : null,
      });
      setDone(true);
    } catch (err) {
      notifyApiError(err, t('auth:onboarding.invalid_token'));
    }
  }

  if (!token) {
    return (
      <div className="space-y-6 text-center" dir="auto">
        <h1 className="text-xl font-semibold">{t('auth:onboarding.missing_token')}</h1>
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
          <h1 className="text-2xl font-bold tracking-tight">
            {t('auth:onboarding.success_title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('auth:onboarding.success_body')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="auto">
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
          <label className="text-sm font-medium" htmlFor="onboarding-fn">
            {tCrm('customers.first_name')}
          </label>
          <input
            id="onboarding-fn"
            type="text"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            {...form.register('first_name')}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="onboarding-father">
            {tCrm('customers.father_name')}
          </label>
          <input
            id="onboarding-father"
            type="text"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            {...form.register('father_name')}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="onboarding-family">
            {tCrm('customers.family_name')}
          </label>
          <input
            id="onboarding-family"
            type="text"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            {...form.register('family_name')}
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
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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

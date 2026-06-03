import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { completeCustomerOnboarding } from '../../api';

export default function CustomerOnboardingPage() {
  const { t } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const [params] = useSearchParams();
  const token = (params.get('token') ?? '').trim();
  const [firstName, setFirstName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [email, setEmail] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      completeCustomerOnboarding({
        token,
        first_name: firstName.trim() || null,
        father_name: fatherName.trim() || null,
        family_name: familyName.trim() || null,
        email: email.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t('customers.onboarding_done'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  if (!token) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('customers.onboarding_missing_token')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t('customers.onboarding_title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('customers.onboarding_subtitle')}</p>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="ob-fn">{t('customers.first_name')}</Label>
        <Input id="ob-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="ob-father">{t('customers.father_name')}</Label>
        <Input id="ob-father" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="ob-family">{t('customers.family_name')}</Label>
        <Input id="ob-family" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="ob-email">{t('customers.email')}</Label>
        <Input id="ob-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
      </div>
      <Button type="button" disabled={submit.isSuccess || submit.isPending} onClick={() => void submit.mutate()}>
        {submit.isSuccess ? t('customers.onboarding_done') : tc('actions.save')}
      </Button>
      {submit.isSuccess ? (
        <p className="text-sm text-muted-foreground">{t('customers.onboarding_wait_activation')}</p>
      ) : null}
    </div>
  );
}

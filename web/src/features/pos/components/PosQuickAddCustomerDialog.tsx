import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createTemporaryCustomer, type CreateTemporaryCustomerResponse } from '@/features/crm/api';
import { crmKeys } from '@/features/crm/queries';
import { notify } from '@/lib/toast';
import { isLibyanMobilePhone, normalizeLyPhoneInput } from '@/lib/validation/contact';

export type PosQuickAddCustomerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new customer id so the parent can attach them to the cart. */
  onCreated: (customerId: number) => Promise<void>;
};

export function PosQuickAddCustomerDialog({ open, onOpenChange, onCreated }: PosQuickAddCustomerDialogProps) {
  const { t } = useTranslation('pos');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [payload, setPayload] = useState<CreateTemporaryCustomerResponse | null>(null);

  useEffect(() => {
    if (!open) {
      setPhone('');
      setStep('form');
      setPayload(null);
    }
  }, [open]);

  const createMut = useMutation({
    mutationFn: () =>
      createTemporaryCustomer({ phone: normalizeLyPhoneInput(phone.trim()) }),
    onSuccess: async (data) => {
      setPayload(data);
      setStep('done');
      await qc.invalidateQueries({ queryKey: [...crmKeys.root, 'customers', 'pos-picker'] });
    },
    onError: (e) => notifyApiError(e, t('register.add_customer_error')),
  });

  const fullOnboardingUrl =
    typeof window !== 'undefined' && payload
      ? `${window.location.origin}${payload.onboarding_path}`
      : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5" aria-hidden />
            {t('register.add_customer_title')}
          </DialogTitle>
          <DialogDescription>{t('register.add_customer_hint')}</DialogDescription>
        </DialogHeader>

        {step === 'form' ? (
          <div className="grid gap-2 py-2">
            <Label htmlFor="pos-new-cust-phone">{t('register.add_customer_phone')}</Label>
            <Input
              id="pos-new-cust-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('register.add_customer_phone_placeholder')}
              dir="ltr"
              autoComplete="tel"
            />
          </div>
        ) : payload ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t('register.add_customer_qr_hint')}</p>
            <div className="flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(fullOnboardingUrl)}`}
                width={220}
                height={220}
                alt=""
                className="rounded-md border bg-white p-2"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">{t('register.add_customer_link')}</Label>
              <code className="break-all rounded-md bg-muted px-2 py-1.5 text-xs" dir="ltr">
                {fullOnboardingUrl}
              </code>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                void navigator.clipboard.writeText(fullOnboardingUrl).then(
                  () => notify.success(t('register.add_customer_copied')),
                  () => notify.error(t('register.add_customer_copy_failed')),
                );
              }}
            >
              {t('register.add_customer_copy')}
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          {step === 'form' ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('register.add_customer_cancel')}
              </Button>
              <Button
                type="button"
                disabled={!phone.trim() || createMut.isPending}
                onClick={() => {
                  if (!isLibyanMobilePhone(phone.trim())) {
                    notify.error(tc('errors.validation_phone_ly'));
                    return;
                  }
                  void createMut.mutate();
                }}
              >
                {t('register.add_customer_submit')}
              </Button>
            </>
          ) : payload ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('register.add_customer_close')}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void onCreated(payload.customer.id)
                    .then(() => onOpenChange(false))
                    .catch((e) => notifyApiError(e, t('register.add_customer_error')));
                }}
              >
                {t('register.add_customer_use_cart')}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

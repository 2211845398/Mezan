import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { applyArPayment, listArOpenItems, type PaymentApplicationCreate } from '@/features/accounting/api';
import { accountingKeys } from '@/features/accounting/queries';
import { newIdempotencyKey } from '@/lib/idempotency';

import { marketingKeys } from '../queries';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: number;
  invoiceNumber: string;
  branchId: number;
  onApplied?: () => void | Promise<void>;
};

export function InvoiceRepaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  branchId,
  onApplied,
}: Props) {
  const { t } = useTranslation('marketing');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [amount, setAmount] = useState('0');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const arQuery = useQuery({
    queryKey: accountingKeys.arOpen({
      branch_id: branchId,
      source_type: 'sales_invoice',
      source_id: String(invoiceId),
    }),
    queryFn: () =>
      listArOpenItems({
        branch_id: branchId,
        source_type: 'sales_invoice',
        source_id: String(invoiceId),
      }),
    enabled: open && branchId > 0 && invoiceId > 0,
  });

  const openItem = arQuery.data?.find((row) => Number.parseFloat(String(row.amount_open)) > 0);

  useEffect(() => {
    if (open && openItem) {
      setAmount(String(openItem.amount_open));
      setReference('');
      setNote('');
    }
  }, [open, openItem]);

  const amountDec = new Decimal(amount || '0');
  const openDec = openItem ? new Decimal(String(openItem.amount_open)) : new Decimal(0);
  const canSubmit =
    openItem != null &&
    amountDec.gt(0) &&
    amountDec.lte(openDec) &&
    !arQuery.isLoading;

  const submit = useMutation({
    mutationFn: async () => {
      if (!openItem) throw new Error('no_open_item');
      const body: PaymentApplicationCreate = {
        amount: amountDec.toFixed(2) as never,
        reference: reference.trim() || null,
        note: note.trim() || null,
      };
      await applyArPayment(openItem.id, body, newIdempotencyKey());
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountingKeys.root });
      await qc.invalidateQueries({ queryKey: marketingKeys.root });
      await onApplied?.();
      toast.success(t('salesRegister.repay_success'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('salesRegister.repay_error')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('salesRegister.repay_title', { invoice: invoiceNumber })}</DialogTitle>
        </DialogHeader>
        {arQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : null}
        {arQuery.isError ? (
          <p className="text-sm text-destructive">{t('salesRegister.repay_load_error')}</p>
        ) : null}
        {!arQuery.isLoading && !openItem ? (
          <p className="text-sm text-muted-foreground">{t('salesRegister.repay_no_balance')}</p>
        ) : null}
        {openItem ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {t('salesRegister.repay_open_balance', { amount: openItem.amount_open })}
            </p>
            <div className="grid gap-1">
              <Label>{t('salesRegister.repay_amount')}</Label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
            <div className="grid gap-1">
              <Label>{t('salesRegister.repay_reference')}</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>{t('salesRegister.repay_note')}</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || submit.isPending}
            onClick={() => void submit.mutateAsync()}
          >
            {t('salesRegister.repay_submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

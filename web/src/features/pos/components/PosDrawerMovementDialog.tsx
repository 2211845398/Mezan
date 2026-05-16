import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { addShiftCashEvent, createPosExpense } from '../api';
import { shiftKeys } from '../queries';

type MovementKind = 'expense' | 'cash_in';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: number;
  terminalId: number;
};

export function PosDrawerMovementDialog({ open, onOpenChange, shiftId, terminalId }: Props) {
  const { t } = useTranslation('pos');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [kind, setKind] = useState<MovementKind>('expense');
  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState('other');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setKind('expense');
      setAmount('0');
      setCategory('other');
      setReason('');
    }
  }, [open]);

  const amtD = new Decimal(amount || '0');
  const reasonOk = reason.trim().length > 0;
  const canExpense = amtD.gt(0) && reasonOk;
  const canCashIn = amtD.gt(0) && reasonOk;

  const submit = useMutation({
    mutationFn: async (): Promise<'expense' | 'cash_in'> => {
      if (kind === 'expense') {
        await createPosExpense({
          shift_id: shiftId,
          expense_category: category,
          amount: amtD.toFixed(2),
          description: reason.trim() || null,
        });
        return 'expense';
      }
      await addShiftCashEvent(shiftId, {
        event_type: 'cash_in',
        amount: amtD.toFixed(2),
        note: reason.trim(),
      });
      return 'cash_in';
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: shiftKeys.current(terminalId) });
      toast.success(
        result === 'expense' ? t('drawer_movement.expense_ok') : t('drawer_movement.cash_in_ok'),
      );
      onOpenChange(false);
    },
    onError: (e) => notifyApiError(e, t('drawer_movement.error')),
  });

  const canSubmit =
    kind === 'expense' ? canExpense : canCashIn;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="auto">
        <DialogHeader>
          <DialogTitle>{t('drawer_movement.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="drawer-movement-kind">{t('drawer_movement.kind_label')}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as MovementKind)}>
              <SelectTrigger id="drawer-movement-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash_in">{t('drawer_movement.kind_cash_in')}</SelectItem>
                <SelectItem value="expense">{t('drawer_movement.kind_expense')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <Label>{t('drawer_movement.amount')}</Label>
            <MoneyInput value={amount} onChange={setAmount} />
          </div>

          {kind === 'expense' ? (
            <div className="grid gap-1">
              <Label>{t('drawer_movement.category')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleaning">{t('drawer_movement.cat_cleaning')}</SelectItem>
                  <SelectItem value="lunch">{t('drawer_movement.cat_lunch')}</SelectItem>
                  <SelectItem value="other">{t('drawer_movement.cat_other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-1">
            <Label>{t('drawer_movement.reason')}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('drawer_movement.reason_placeholder')}
            />
          </div>
        </div>
        <DialogFooter className="!mt-2 !grid w-full grid-cols-2 gap-[5px] sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="min-h-9 w-full"
            onClick={() => onOpenChange(false)}
          >
            {tc('actions.cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-9 w-full"
            disabled={!canSubmit || submit.isPending}
            onClick={() => void submit.mutate()}
          >
            {t('drawer_movement.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
import { newIdempotencyKey } from '@/lib/idempotency';

import type { OpenItemRead, PaymentApplicationCreate } from '../../api';
import { applyApPayment } from '../../api';
import { accountingKeys } from '../../queries';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: OpenItemRead[];
};

export default function ApApplyPaymentDrawer({ open, onOpenChange, items }: Props) {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [tendered, setTendered] = useState('0');
  const [alloc, setAlloc] = useState<Record<number, string>>({});
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setTendered('0');
      setAlloc(Object.fromEntries(items.map((i) => [i.id, '0'])));
      setReference('');
      setNote('');
    }
  }, [open, items]);

  const totalApplied = useMemo(() => {
    let s = new Decimal(0);
    for (const i of items) {
      s = s.add(new Decimal(alloc[i.id] || '0'));
    }
    return s;
  }, [alloc, items]);

  const tenderD = useMemo(() => new Decimal(tendered || '0'), [tendered]);
  const canSubmit =
    totalApplied.lte(tenderD) &&
    items.every((i) => {
      const a = new Decimal(alloc[i.id] || '0');
      return a.gte(0) && a.lte(new Decimal(i.amount_open));
    }) &&
    totalApplied.gt(0);

  const m = useMutation({
    mutationFn: async () => {
      for (const it of items) {
        const amt = new Decimal(alloc[it.id] || '0');
        if (amt.lte(0)) continue;
        const body: PaymentApplicationCreate = {
          amount: amt.toFixed(2) as never,
          reference: reference || null,
          note: note || null,
        };
        await applyApPayment(it.id, body, newIdempotencyKey());
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountingKeys.root });
      toast.success(t('ap.apply_ok'));
      onOpenChange(false);
    },
    onError: () => toast.error(t('errors.generic')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('ap.drawer_title')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>{t('ar.tendered')}</Label>
            <MoneyInput value={tendered} onChange={setTendered} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('ar.total_applied', { v: totalApplied.toFixed(2) })}
          </p>
          {items.map((it) => (
            <div key={it.id} className="grid gap-1">
              <Label>
                #{it.id} — {it.source_id} ({it.amount_open})
              </Label>
              <MoneyInput
                value={alloc[it.id] ?? '0'}
                onChange={(v) => setAlloc((p) => ({ ...p, [it.id]: v }))}
              />
            </div>
          ))}
          <div className="grid gap-1">
            <Label>{t('ar.reference')}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>{t('ar.note')}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" disabled={!canSubmit || m.isPending} onClick={() => void m.mutate()}>
            {t('ap.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

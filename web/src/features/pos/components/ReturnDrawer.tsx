import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { thermalModelFromCreditNote } from '../print/mapModel';
import type { ThermalReceiptModel } from '../print/types';
import { useReturnLookup, useSubmitReturnMutation } from '../queries';

export type ReturnDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchLabel: string;
  currency: string;
  exchangeCartId?: number | null;
  onCredit: (model: ThermalReceiptModel) => void;
};

export function ReturnDrawer({
  open,
  onOpenChange,
  branchLabel,
  currency,
  exchangeCartId,
  onCredit,
}: ReturnDrawerProps) {
  const { t } = useTranslation('pos');
  const canReturn = usePermission('returns', 'create');
  const [barcode, setBarcode] = useState('');
  const [reason, setReason] = useState('');
  const [lookupOn, setLookupOn] = useState(false);
  const { data: lookup, isFetching } = useReturnLookup(barcode.trim() || null, lookupOn);
  const submit = useSubmitReturnMutation();

  const [qtyByLine, setQtyByLine] = useState<Record<number, number>>({});

  const lines = lookup?.lines ?? [];

  useEffect(() => {
    if (!open) {
      setBarcode('');
      setReason('');
      setLookupOn(false);
      setQtyByLine({});
    }
  }, [open]);

  function runLookup() {
    if (!barcode.trim()) return;
    setLookupOn(true);
  }

  async function doSubmit() {
    if (!lookup) return;
    const linesPayload = Object.entries(qtyByLine)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => ({ sales_invoice_line_id: Number.parseInt(id, 10), qty }));
    if (!linesPayload.length) {
      notify.error(t('return.none_selected'));
      return;
    }
    try {
      const res = await submit.mutateAsync({
        invoice_barcode: lookup.invoice_barcode,
        reason: reason.trim() || null,
        lines: linesPayload,
        exchange_cart_id: exchangeCartId ?? null,
      });
      const model = thermalModelFromCreditNote({
        branchLabel,
        currency,
        creditNumber: res.credit_number,
        total: res.total_amount,
        lines: linesPayload.map((p) => {
          const src = lines.find((l) => l.sales_invoice_line_id === p.sales_invoice_line_id);
          return {
            name: src?.product_name ?? '',
            qty: p.qty,
            unitPrice: '0',
            lineTotal: '0',
            taxAmount: '0',
          };
        }),
      });
      notify.success(t('return.credit_note', { id: res.credit_note_id }));
      onCredit(model);
      onOpenChange(false);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (!canReturn) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{t('return.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[calc(100dvh-14rem)] gap-3 overflow-y-auto px-6 py-4">
          <div className="space-y-1">
            <Label>{t('return.lookup')}</Label>
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => {
                  setLookupOn(false);
                  setBarcode(e.target.value);
                }}
                placeholder={t('return.scan_hint')}
              />
              <Button type="button" variant="secondary" onClick={runLookup}>
                {t('return.search')}
              </Button>
            </div>
          </div>
          {isFetching ? <p className="text-sm text-muted-foreground">…</p> : null}
          {lookup ? (
            <>
              <p className="text-sm font-medium">
                #{lookup.invoice_number} — {lookup.invoice_barcode}
              </p>
              <div className="space-y-1">
                <Label>{t('return.reason')}</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">{t('return.lines')}</div>
                {lines.map((ln) => (
                  <div key={ln.sales_invoice_line_id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1">
                      <div>{ln.product_name}</div>
                      <div className="text-[11px] text-muted-foreground" dir="ltr">
                        max {ln.qty_remaining}
                      </div>
                    </div>
                    <Input
                      className="w-20"
                      type="number"
                      min={0}
                      max={ln.qty_remaining}
                      value={qtyByLine[ln.sales_invoice_line_id] ?? 0}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10) || 0;
                        setQtyByLine((prev) => ({
                          ...prev,
                          [ln.sales_invoice_line_id]: Math.min(
                            Math.max(0, n),
                            ln.qty_remaining,
                          ),
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter className="gap-2 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button type="button" onClick={() => void doSubmit()} disabled={!lookup || submit.isPending}>
            {t('return.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

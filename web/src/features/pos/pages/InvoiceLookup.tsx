import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Can } from '@/components/shared/Can';
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
import { useAuthStore } from '@/features/auth/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { formatDateTime, fromISO } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { notify } from '@/lib/toast';

import type { SalesInvoiceListItem } from '../api';
import { ReceiptModal } from '../components/ReceiptModal';
import { thermalModelFromInvoiceDetail } from '../print/mapModel';
import type { ThermalReceiptModel } from '../print/types';
import { useInvoice, useTodayInvoices, useVoidSale } from '../queries';
import { usePosTerminalStore } from '../stores/posTerminalStore';

const POS_CURRENCY = 'USD';

export default function InvoiceLookup() {
  const { t } = useTranslation('pos');
  const branchId = useAuthStore((s) => s.activeBranchId) ?? 0;
  const branchLabel = branchId ? `Branch #${branchId}` : '';
  const { activeTerminalId: terminalId } = usePosTerminalStore();
  const canRead = usePermission('sales_invoices', 'read');

  const { data: rows, isLoading } = useTodayInvoices(terminalId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = useInvoice(selectedId);

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptModel, setReceiptModel] = useState<ThermalReceiptModel | null>(null);

  const voidSale = useVoidSale();
  const [voidTarget, setVoidTarget] = useState<SalesInvoiceListItem | null>(null);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    if (!selectedId || !detail || detail.id !== selectedId) return;
    const model = thermalModelFromInvoiceDetail(detail, {
      branchLabel,
      currency: POS_CURRENCY,
    });
    setReceiptModel(model);
    setReceiptOpen(true);
  }, [selectedId, detail, branchLabel]);

  if (!canRead) {
    return <p className="p-6 text-sm text-muted-foreground">403</p>;
  }

  async function confirmVoid() {
    if (!voidTarget) return;
    try {
      await voidSale.mutateAsync({
        invoice_id: voidTarget.id,
        invoice_barcode: null,
        reason: voidReason.trim() || null,
      });
      notify.success(t('invoices.void_success', { number: voidTarget.invoice_number }));
      setVoidTarget(null);
      setVoidReason('');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/pos">{t('shell.nav_gate')}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/pos/register">{t('shell.nav_register')}</Link>
        </Button>
      </div>
      <h1 className="text-lg font-semibold">{t('invoices.title')}</h1>
      {!terminalId ? (
        <p className="text-sm text-destructive">{t('gate.select_terminal')}</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : !rows?.length ? (
        <p className="text-sm text-muted-foreground">{t('invoices.empty')}</p>
      ) : (
        <div className="overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-start">#</th>
                <th className="p-2 text-start">{t('receipt.invoice_no')}</th>
                <th className="p-2 text-start">{t('register.total')}</th>
                <th className="p-2 text-start"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.id}</td>
                  <td className="p-2">{r.invoice_number}</td>
                  <td className="p-2" dir="ltr">
                    {formatCurrency(Number.parseFloat(r.total), POS_CURRENCY)}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => setSelectedId(r.id)}>
                        {t('invoices.reprint')}
                      </Button>
                      <Can resource="sales_invoices" action="void">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="min-h-9"
                          onClick={() => {
                            setVoidTarget(r);
                            setVoidReason('');
                          }}
                        >
                          {t('invoices.void')}
                        </Button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && detail && detail.id === selectedId ? (
        <p className="text-xs text-muted-foreground">
          {detail.invoice_number} · {formatDateTime(fromISO(detail.created_at))}
        </p>
      ) : null}

      <Dialog
        open={voidTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setVoidTarget(null);
            setVoidReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoices.void_title')}</DialogTitle>
          </DialogHeader>
          {voidTarget ? (
            <p className="text-sm text-muted-foreground">
              {voidTarget.invoice_number} ·{' '}
              <span dir="ltr">
                {formatCurrency(Number.parseFloat(voidTarget.total), POS_CURRENCY)}
              </span>
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="void-reason">{t('invoices.void_reason')}</Label>
            <Input
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder={t('invoices.void_reason_placeholder')}
              disabled={voidSale.isPending}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVoidTarget(null);
                setVoidReason('');
              }}
              disabled={voidSale.isPending}
            >
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={voidSale.isPending}
              onClick={() => void confirmVoid()}
            >
              {t('invoices.void_confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {receiptModel ? (
        <ReceiptModal
          open={receiptOpen}
          onOpenChange={(o) => {
            setReceiptOpen(o);
            if (!o) {
              setReceiptModel(null);
              setSelectedId(null);
            }
          }}
          model={receiptModel}
        />
      ) : null}
    </div>
  );
}

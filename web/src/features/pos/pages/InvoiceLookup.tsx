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
import { useBranch } from '@/features/admin/queries';
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
  const { t: tc } = useTranslation('common');
  const branchId = useAuthStore((s) => s.activeBranchId) ?? 0;
  const { data: activeBranch } = useBranch(branchId, {
    enabled: branchId > 0,
  });
  const branchLabel =
    activeBranch?.name?.trim() ||
    (branchId > 0 ? tc('layout.branch_context', { id: branchId }) : '');
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
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:gap-5 sm:p-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight sm:text-2xl">{t('invoices.title')}</h1>
        <Button
          asChild
          variant="outline"
          className="h-10 shrink-0 whitespace-nowrap border-border/80 bg-background px-4 text-sm font-medium shadow-sm"
        >
          <Link to="/pos/register">{t('invoices.back_register')}</Link>
        </Button>
      </div>

      {!terminalId ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('gate.select_terminal')}
        </p>
      ) : isLoading ? (
        <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
          …
        </div>
      ) : !rows?.length ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-14 text-center">
          <p className="text-sm font-medium text-muted-foreground">{t('invoices.empty')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <div className="max-h-full overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: '3.5rem' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '11.5rem' }} />
              </colgroup>
              <thead className="sticky top-0 z-10 border-b border-border/60 bg-muted/55 backdrop-blur-sm supports-[backdrop-filter]:bg-muted/45">
                <tr>
                  <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    #
                  </th>
                  <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('receipt.invoice_no')}
                  </th>
                  <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('invoices.col_customer')}
                  </th>
                  <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('invoices.col_time')}
                  </th>
                  <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('register.total')}
                  </th>
                  <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {' '}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const customerLabel =
                    (r.customer_display && r.customer_display.trim()) ||
                    (r.customer_id != null ? t('invoices.customer_missing') : t('invoices.walk_in'));
                  return (
                  <tr
                    key={r.id}
                    className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.id}</td>
                    <td className="min-w-0 px-3 py-2.5">
                      <span className="block truncate font-medium" title={r.invoice_number}>
                        {r.invoice_number}
                      </span>
                    </td>
                    <td className="min-w-0 px-3 py-2.5">
                      <span className="block truncate text-muted-foreground" title={customerLabel}>
                        {customerLabel}
                      </span>
                    </td>
                    <td className="min-w-0 whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateTime(fromISO(r.created_at))}
                    </td>
                    <td className="px-3 py-2.5 text-start">
                      <span
                        dir="ltr"
                        className="inline-block whitespace-nowrap font-semibold tabular-nums tracking-tight"
                      >
                        {formatCurrency(Number.parseFloat(r.total), POS_CURRENCY)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-9 bg-primary font-medium text-primary-foreground shadow-sm shadow-primary/15 hover:bg-primary/90"
                          onClick={() => setSelectedId(r.id)}
                        >
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
                  );
                })}
              </tbody>
            </table>
          </div>
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

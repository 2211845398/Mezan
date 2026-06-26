import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { OpenItemRead } from '@/features/accounting/api';
import ApApplyPaymentDrawer from '@/features/accounting/pages/ap/ApApplyPaymentDrawer';
import { accountingKeys } from '@/features/accounting/queries';
import { usePermission } from '@/hooks/usePermission';
import { formatCurrency, formatMoney } from '@/lib/format';

import type { SupplierStatementLineRead } from '../../api';
import { formatSupplierStatementDescription } from '../../lib/supplierStatementDescription';
import { purchasingKeys } from '../../queries';

type Props = {
  line: SupplierStatementLineRead | null;
  supplierId: number;
  currencyCode: string;
  branchId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function toOpenItem(
  line: SupplierStatementLineRead,
  supplierId: number,
  currencyCode: string,
  branchId?: number,
): OpenItemRead | null {
  if (line.open_item_id == null || line.amount_open == null) return null;
  const openAmt = String(line.amount_open);
  if (Number(openAmt) <= 0) return null;
  return {
    id: line.open_item_id,
    branch_id: branchId ?? 0,
    supplier_id: supplierId,
    source_type: line.source_type ?? 'goods_receipt',
    source_id: line.source_id ?? String(line.open_item_id),
    description: line.description,
    document_date: line.entry_date,
    due_date: null,
    currency_code: currencyCode,
    fx_rate: null,
    amount_total: line.amount_total ?? openAmt,
    amount_open: openAmt,
    status: 'open',
    days_overdue: null,
    customer_id: null,
  };
}

export default function SupplierStatementLineDrawer({
  line,
  supplierId,
  currencyCode,
  branchId,
  open,
  onOpenChange,
}: Props) {
  const { t, i18n } = useTranslation('purchasing');
  const { t: tc } = useTranslation('common');
  const canPay = usePermission('accounting', 'update');
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);

  const payItem = useMemo(
    () => (line ? toOpenItem(line, supplierId, currencyCode, branchId) : null),
    [branchId, currencyCode, line, supplierId],
  );

  const showPay =
    canPay && payItem != null && Number(payItem.amount_open) > 0;

  const invalidateAfterPay = async () => {
    await Promise.all([
      qc.invalidateQueries({
        queryKey: [...purchasingKeys.root, 'supplier', supplierId],
      }),
      qc.invalidateQueries({ queryKey: accountingKeys.root }),
    ]);
  };

  if (!line) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('suppliers.statement.line_detail_title')}</DialogTitle>
          </DialogHeader>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('suppliers.statement.col.date')}</dt>
              <dd dir="ltr" className="tabular-nums font-medium">
                {line.entry_date}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('suppliers.statement.col.reference')}</dt>
              <dd className="font-medium">{line.reference}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('suppliers.statement.col.description')}</dt>
              <dd>{formatSupplierStatementDescription(line, t, i18n.language)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('suppliers.statement.col.debit')}</dt>
              <dd dir="ltr" className="tabular-nums">
                {formatCurrency(line.debit, currencyCode)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('suppliers.statement.col.credit')}</dt>
              <dd dir="ltr" className="tabular-nums">
                {formatCurrency(line.credit, currencyCode)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('suppliers.statement.col.balance')}</dt>
              <dd dir="ltr" className="tabular-nums font-medium">
                {formatCurrency(line.running_balance, currencyCode)}
              </dd>
            </div>
            {line.amount_total != null ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('suppliers.statement.line_total')}</dt>
                <dd dir="ltr" className="tabular-nums">
                  {formatCurrency(line.amount_total, currencyCode)}
                </dd>
              </div>
            ) : null}
            {line.amount_paid != null ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('suppliers.statement.line_paid')}</dt>
                <dd dir="ltr" className="tabular-nums">
                  {formatCurrency(line.amount_paid, currencyCode)}
                </dd>
              </div>
            ) : null}
            {line.amount_open != null ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('suppliers.statement.line_remaining')}</dt>
                <dd dir="ltr" className="tabular-nums font-medium text-destructive">
                  {formatCurrency(line.amount_open, currencyCode)}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-wrap gap-2">
            {line.purchase_order_id != null ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to={`/purchasing/orders/${line.purchase_order_id}`}>
                  {t('suppliers.statement.view_po')}
                </Link>
              </Button>
            ) : null}
            {line.journal_entry_id != null ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to={`/accounting/journal/${line.journal_entry_id}`}>
                  {t('suppliers.statement.view_journal')}
                </Link>
              </Button>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('actions.close')}
            </Button>
            {showPay && payItem ? (
              <Button type="button" onClick={() => setPayOpen(true)}>
                {t('suppliers.statement.apply_payment')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {payItem ? (
        <ApApplyPaymentDrawer
          open={payOpen}
          onOpenChange={setPayOpen}
          items={[payItem]}
          initialAlloc={{ [payItem.id]: formatMoney(payItem.amount_open) }}
          initialTendered={formatMoney(payItem.amount_open)}
          onSuccess={() => {
            void invalidateAfterPay();
            onOpenChange(false);
          }}
        />
      ) : null}
    </>
  );
}

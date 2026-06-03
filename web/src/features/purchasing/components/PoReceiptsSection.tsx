import Decimal from 'decimal.js';
import { useTranslation } from 'react-i18next';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fromISO } from '@/lib/date';
import { formatDateTime, formatMoney } from '@/lib/format';

import type { GoodsReceiptRead } from '../api';

export type PoReceiptsSectionProps = {
  receipts: GoodsReceiptRead[];
  productLabels: Record<number, string>;
  variantLabels: Record<number, string>;
  variantReferenceCodes: Record<number, string>;
  branchesById: Record<number, string>;
};

function receiptLineTotal(qty: number, unitCost: string): string {
  return new Decimal(unitCost).mul(qty).toFixed(2);
}

function receiptGrandTotal(receipt: GoodsReceiptRead): string {
  let t = new Decimal(0);
  for (const ln of receipt.lines ?? []) {
    t = t.plus(new Decimal(String(ln.unit_cost)).mul(ln.qty));
  }
  return t.toFixed(2);
}

export default function PoReceiptsSection({
  receipts,
  productLabels,
  variantLabels,
  variantReferenceCodes,
  branchesById,
}: PoReceiptsSectionProps) {
  const { t } = useTranslation('purchasing');
  const { t: tInv } = useTranslation('inventory');

  if (receipts.length === 0) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {receipts.map((r) => {
        const branchName = branchesById[r.branch_id] ?? `#${r.branch_id}`;
        const grandTotal = receiptGrandTotal(r);
        return (
          <div key={r.id} className="overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/40 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-semibold">
                  {t('orders.detail_page.receipt_number', { id: r.id })}
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span>{t('orders.detail_page.receipt_date')}:</span>
                  <span className="font-medium text-foreground num-latin tabular-nums">
                    {r.created_at
                      ? formatDateTime(fromISO(r.created_at), 'yyyy-MM-dd HH:mm')
                      : '—'}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span>{t('orders.detail_page.receipt_branch')}:</span>
                  <span className="font-medium text-foreground">{branchName}</span>
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className="text-muted-foreground">{t('orders.detail_page.receipt_total')}:</span>
                <span className="tabular-nums num-latin">{formatMoney(grandTotal)}</span>
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">{t('orders.detail_page.line_no')}</TableHead>
                  <TableHead>{t('orders.form.product')}</TableHead>
                  <TableHead>{t('orders.detail_page.variant_col')}</TableHead>
                  <TableHead className="text-center">{tInv('stock.col.reference_code')}</TableHead>
                  <TableHead className="text-end">{t('orders.form.qty')}</TableHead>
                  <TableHead className="text-end">{t('orders.receive.unit_cost')}</TableHead>
                  <TableHead className="text-end">{t('orders.detail_page.receipt_line_total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(r.lines ?? []).map((ln) => {
                  const lineTotal = receiptLineTotal(ln.qty, String(ln.unit_cost));
                  return (
                    <TableRow key={ln.id}>
                      <TableCell className="tabular-nums num-latin text-muted-foreground">
                        {ln.purchase_order_line_id ?? '—'}
                      </TableCell>
                      <TableCell>{productLabels[ln.product_id] ?? `#${ln.product_id}`}</TableCell>
                      <TableCell>
                        {variantLabels[ln.variant_id]?.trim() || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className="mx-auto block max-w-full truncate num-latin tabular-nums"
                          dir="ltr"
                          title={variantReferenceCodes[ln.variant_id] || undefined}
                        >
                          {variantReferenceCodes[ln.variant_id]?.trim() || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-end tabular-nums num-latin">{ln.qty}</TableCell>
                      <TableCell className="text-end tabular-nums num-latin">
                        {formatMoney(String(ln.unit_cost))}
                      </TableCell>
                      <TableCell className="text-end tabular-nums num-latin">
                        {formatMoney(lineTotal)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {r.notes?.trim() ? (
              <p className="border-t bg-muted/20 px-4 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t('orders.notes_section.receipt_on_receipt')}:
                </span>{' '}
                <span className="whitespace-pre-wrap">{r.notes}</span>
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

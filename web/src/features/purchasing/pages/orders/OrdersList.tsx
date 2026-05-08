import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';

import type { PurchaseOrderRead } from '../../api';
import { purchaseOrdersQueryOptions } from '../../queries';
import {
  PurchasingInvoiceScanUploadButton,
  PurchasingPendingInvoiceScansSection,
} from '../../components/PurchasingInvoiceScanIntake';

import OrderForm from './OrderForm';

function poTotal(po: PurchaseOrderRead): string {
  let t = new Decimal(0);
  for (const ln of po.lines ?? []) {
    t = t.plus(new Decimal(ln.unit_cost).mul(ln.qty));
  }
  return t.toFixed(2);
}

const STATUSES = ['draft', 'sent', 'tracked', 'closed', 'cancelled'] as const;

export default function OrdersList() {
  const { t } = useTranslation('purchasing');
  const canCreate = usePermission('purchase_orders', 'create');
  const canScanCreate = usePermission('invoice_scans', 'create');
  const canScanRead = usePermission('invoice_scans', 'read');
  const [status, setStatus] = useState<string>('');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderFormKey, setNewOrderFormKey] = useState(0);
  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    purchaseOrdersQueryOptions(status || undefined),
  );

  const columns = useMemo(
    () =>
      defineColumns<PurchaseOrderRead>()([
        {
          id: 'po_number',
          header: t('orders.col.po_number'),
          cell: ({ row }) => `PO-${row.original.id}`,
        },
        {
          id: 'supplier',
          header: t('orders.col.supplier'),
          cell: ({ row }) => row.original.supplier_name,
        },
        {
          id: 'status',
          accessorKey: 'status',
          header: t('orders.col.status'),
          cell: ({ row }) => {
            const s = row.original.status;
            const key = (['draft', 'sent', 'tracked', 'closed', 'cancelled'] as const).find((x) => x === s) ?? 'draft';
            return t(`orders.status.${key}`);
          },
        },
        {
          id: 'expected',
          header: t('orders.col.expected'),
          cell: ({ row }) => row.original.expected_at?.slice(0, 10) ?? '—',
        },
        {
          id: 'total',
          header: t('orders.col.total'),
          cell: ({ row }) => poTotal(row.original),
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="icon" variant="ghost" asChild>
              <Link to={`/purchasing/orders/${row.original.id}`} aria-label={t('orders.detail')}>
                <Eye className="size-4" />
              </Link>
            </Button>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('orders.title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canScanCreate ? <PurchasingInvoiceScanUploadButton /> : null}
            {canCreate ? (
              <Button
                type="button"
                onClick={() => {
                  setNewOrderFormKey((k) => k + 1);
                  setNewOrderOpen(true);
                }}
              >
                <Plus className="me-2 size-4" />
                {t('orders.new')}
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Label className="shrink-0">{t('orders.filter_status')}</Label>
        <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('orders.all_statuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('orders.all_statuses')}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`orders.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {canScanRead ? <PurchasingPendingInvoiceScansSection /> : null}
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <FloatingFormDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        title={t('orders.new')}
        maxWidth="3xl"
      >
        {newOrderOpen ? (
          <OrderForm
            key={newOrderFormKey}
            variant="dialog"
            onDismiss={() => setNewOrderOpen(false)}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

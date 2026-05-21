import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { ClipboardList, Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { PurchaseOrderRead } from '../../api';
import { purchaseOrdersQueryOptions } from '../../queries';

function poTotalDisplay(po: PurchaseOrderRead): string | null {
  const lines = po.lines ?? [];
  if (lines.length === 0) return null;
  if (lines.some((ln) => ln.unit_cost == null || ln.unit_cost === '')) {
    return null;
  }
  let t = new Decimal(0);
  for (const ln of lines) {
    t = t.plus(new Decimal(ln.unit_cost!).mul(ln.qty));
  }
  return t.toFixed(2);
}

const STATUSES = ['draft', 'sent', 'tracked', 'closed', 'cancelled'] as const;

export default function OrdersList() {
  const { t } = useTranslation('purchasing');
  const canCreate = usePermission('purchase_orders', 'create');
  const canUpdate = usePermission('purchase_orders', 'update');
  const [status, setStatus] = useState<string>('');

  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    purchaseOrdersQueryOptions(status || undefined),
  );

  // KPI counts computed client-side from the full (unfiltered) dataset
  const allRows = useQuery(purchaseOrdersQueryOptions(undefined));
  const kpiCounts = useMemo(() => {
    const data = allRows.data ?? [];
    return {
      draft: data.filter((r) => r.status === 'draft').length,
      sent: data.filter((r) => r.status === 'sent').length,
      tracked: data.filter((r) => r.status === 'tracked').length,
      closed: data.filter((r) => r.status === 'closed').length,
    };
  }, [allRows.data]);

  const columns = useMemo(
    () =>
      defineColumns<PurchaseOrderRead>()([
        {
          id: 'po_number',
          header: t('orders.col.po_number'),
          cell: ({ row }) => (
            <Link
              to={`/purchasing/orders/${row.original.id}`}
              className="font-mono font-medium text-primary hover:underline num-latin"
            >
              PO-{row.original.id}
            </Link>
          ),
        },
        {
          id: 'supplier',
          header: t('orders.col.supplier'),
          cell: ({ row }) => row.original.supplier_name,
        },
        {
          id: 'branch',
          header: t('orders.col.branch'),
          cell: ({ row }) => row.original.branch_name?.trim() || '—',
        },
        {
          id: 'status',
          accessorKey: 'status',
          header: t('orders.col.status'),
          cell: ({ row }) => {
            const s = row.original.status;
            const key = (['draft', 'sent', 'tracked', 'closed', 'cancelled'] as const).find((x) => x === s) ?? 'draft';
            return <StatusBadge status={s} label={t(`orders.status.${key}`)} />;
          },
        },
        {
          id: 'created',
          header: t('orders.col.created_at'),
          cell: ({ row }) =>
            (row.original as PurchaseOrderRead & { created_at?: string }).created_at?.slice(0, 10) ?? '—',
        },
        {
          id: 'expected',
          header: t('orders.col.expected'),
          cell: ({ row }) => row.original.expected_at?.slice(0, 10) ?? '—',
        },
        {
          id: 'total',
          header: t('orders.col.total'),
          cell: ({ row }) => {
            const total = poTotalDisplay(row.original);
            return (
              <span className="tabular-nums num-latin">
                {total != null ? formatMoney(total) : '—'}
              </span>
            );
          },
        },
        {
          id: 'actions',
          header: t('orders.col.actions'),
          cell: ({ row }) => {
            const po = row.original;
            return (
              <TooltipProvider>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" asChild>
                        <Link to={`/purchasing/orders/${po.id}`} aria-label={t('orders.actions.view')}>
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('orders.actions.view')}</TooltipContent>
                  </Tooltip>
                  {canUpdate && po.status === 'sent' ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" asChild>
                          <Link
                            to={`/purchasing/orders/${po.id}/receive`}
                            aria-label={t('orders.actions.receive')}
                          >
                            <ClipboardList className="size-4" />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('orders.actions.receive')}</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              </TooltipProvider>
            );
          },
        },
      ]),
    [t, canUpdate],
  );

  type KpiItem = { key: string; label: string; count: number; statusVal: string };
  const kpiItems: KpiItem[] = [
    { key: 'draft', label: t('orders.status.draft'), count: kpiCounts.draft, statusVal: 'draft' },
    { key: 'sent', label: t('orders.status.sent'), count: kpiCounts.sent, statusVal: 'sent' },
    { key: 'tracked', label: t('orders.status.tracked'), count: kpiCounts.tracked, statusVal: 'tracked' },
    { key: 'closed', label: t('orders.status.closed'), count: kpiCounts.closed, statusVal: 'closed' },
  ];

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title={t('orders.title')}
        actions={
          canCreate ? (
            <Button type="button" asChild>
              <Link to="/purchasing/orders/new">
                <Plus className="me-2 size-4" />
                {t('orders.new')}
              </Link>
            </Button>
          ) : null
        }
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        {kpiItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setStatus((prev) => (prev === item.statusVal ? '' : item.statusVal))}
            className={cn(
              'rounded-lg border bg-card p-3 text-start transition-all cursor-pointer hover:shadow-sm hover:ring-2 hover:ring-primary/40',
              status === item.statusVal && 'ring-2 ring-primary shadow-sm',
            )}
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums num-latin">{item.count}</p>
          </button>
        ))}
      </div>

      <div className="mt-[75px]">
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        toolbarExtras={
          <div className="flex flex-wrap items-center gap-2">
            <Label className="shrink-0 text-sm leading-none">{t('orders.filter_status')}</Label>
            <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 w-[200px]">
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
        }
      />
      </div>
    </div>
  );
}

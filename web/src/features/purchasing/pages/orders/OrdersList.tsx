import { useQueries, useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { ClipboardList, Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { paginatedParams } from '@/api/pagination';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
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
import {
  purchaseOrdersQueryOptions,
  purchaseOrderStatusTotalQueryOptions,
} from '../../queries';

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
const KPI_STATUSES = ['draft', 'sent', 'tracked', 'closed'] as const;

export default function OrdersList() {
  const { t } = useTranslation('purchasing');
  const canCreate = usePermission('purchase_orders', 'create');
  const canUpdate = usePermission('purchase_orders', 'update');
  const [status, setStatus] = useState<string>('');

  const [urlQuery] = useTableUrlState({ pageSize: 20 });
  const { limit, offset } = paginatedParams(urlQuery.page, urlQuery.pageSize);

  const { data, isLoading, isError, refetch } = useQuery(
    purchaseOrdersQueryOptions({
      ...(status ? { status } : {}),
      limit,
      offset,
    }),
  );
  const rows = data?.items ?? [];
  const totalRows = data?.total ?? 0;

  const kpiQueries = useQueries({
    queries: KPI_STATUSES.map((s) => purchaseOrderStatusTotalQueryOptions(s)),
  });

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
            const key =
              (['draft', 'sent', 'tracked', 'closed', 'cancelled'] as const).find((x) => x === s) ??
              'draft';
            return <StatusBadge status={s} label={t(`orders.status.${key}`)} />;
          },
        },
        {
          id: 'created',
          header: t('orders.col.created_at'),
          cell: ({ row }) =>
            (row.original as PurchaseOrderRead & { created_at?: string }).created_at?.slice(0, 10) ??
            '—',
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
  const kpiItems: KpiItem[] = KPI_STATUSES.map((s, i) => ({
    key: s,
    label: t(`orders.status.${s}`),
    count: kpiQueries[i]?.data ?? 0,
    statusVal: s,
  }));

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

      <div className="grid gap-3 sm:grid-cols-4">
        {kpiItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setStatus((prev) => (prev === item.statusVal ? '' : item.statusVal))}
            className={cn(
              'cursor-pointer rounded-lg border border-border bg-card p-3 text-start transition-all hover:shadow-sm hover:ring-2 hover:ring-border',
              status === item.statusVal && 'ring-2 ring-border shadow-sm',
            )}
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums num-latin">{item.count}</p>
          </button>
        ))}
      </div>

      <div className="mt-[75px]">
        <DataTable
          mode="server"
          columns={columns}
          data={rows}
          totalRows={totalRows}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          showSearch={false}
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

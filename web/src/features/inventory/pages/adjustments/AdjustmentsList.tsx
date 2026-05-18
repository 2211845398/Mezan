import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { cn } from '@/lib/utils';

import type { StockMovement } from '../../api';
import { useMovementsQuery } from '../../queries';
import AdjustmentForm from './AdjustmentForm';

const MOVEMENT_KINDS = [
  'increase',
  'decrease',
  'damage',
  'count_adjustment',
  'receipt',
  'sale',
  'transfer_out',
  'transfer_in',
] as const;

export default function AdjustmentsList() {
  const { t } = useTranslation('inventory');
  const canCreate = usePermission('stock_adjustments', 'create');
  const { data: rows = [], isLoading, isError, refetch } = useMovementsQuery({ limit: 200, offset: 0 });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementFormKey, setMovementFormKey] = useState(0);
  const [branchFilter, setBranchFilter] = useState('__all');
  const [kindFilter, setKindFilter] = useState('__all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (branchFilter !== '__all' && String(r.branch_id) !== branchFilter) return false;
      if (kindFilter !== '__all' && r.movement_kind !== kindFilter) return false;
      if (dateFrom) {
        const d = r.created_at ? String(r.created_at).slice(0, 10) : '';
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = r.created_at ? String(r.created_at).slice(0, 10) : '';
        if (d > dateTo) return false;
      }
      return true;
    });
  }, [rows, branchFilter, kindFilter, dateFrom, dateTo]);

  const columns = useMemo(
    () =>
      defineColumns<StockMovement>()([
        { id: 'id', accessorKey: 'id', header: t('adjustments.col.movement_no') },
        {
          id: 'branch',
          header: t('adjustments.col.branch'),
          cell: ({ row }) => row.original.branch_name ?? String(row.original.branch_id),
        },
        {
          id: 'product',
          header: t('adjustments.col.product'),
          cell: ({ row }) => row.original.product_name ?? String(row.original.product_id),
        },
        {
          id: 'delta',
          accessorKey: 'qty_delta',
          header: t('adjustments.col.delta'),
          cell: ({ row }) => {
            const delta = row.original.qty_delta ?? 0;
            const isPositive = delta > 0;
            return (
              <span
                className={cn(
                  'tabular-nums num-latin font-medium',
                  isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
                )}
              >
                {isPositive ? `+${delta}` : String(delta)}
              </span>
            );
          },
        },
        {
          id: 'kind',
          header: t('adjustments.col.kind'),
          cell: ({ row }) => row.original.movement_kind ?? '—',
        },
        { id: 'reason', accessorKey: 'reason', header: t('adjustments.col.reason') },
        {
          id: 'at',
          accessorKey: 'created_at',
          header: t('adjustments.col.at'),
          cell: ({ row }) =>
            row.original.created_at ? formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm') : '—',
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('adjustments.title')}
        actions={
          canCreate ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setMovementFormKey((k) => k + 1);
                setMovementDialogOpen(true);
              }}
            >
              {t('adjustments.new')}
            </Button>
          ) : null
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="grid gap-1">
          <Label>{t('stock.filter.branch')}</Label>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('stock.filter.all_branches')}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('adjustments.filter.kind')}</Label>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('adjustments.filter.all_kinds')}</SelectItem>
              {MOVEMENT_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`adjustments.kind.${k}`, k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('adjustments.filter.date_from')}</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="grid gap-1">
          <Label>{t('adjustments.filter.date_to')}</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[160px]"
          />
        </div>
        {(branchFilter !== '__all' || kindFilter !== '__all' || dateFrom || dateTo) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setBranchFilter('__all');
              setKindFilter('__all');
              setDateFrom('');
              setDateTo('');
            }}
          >
            {t('adjustments.filter.clear')}
          </Button>
        ) : null}
      </div>

      <DataTable
        mode="client"
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <FloatingFormDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        title={t('adjustments.new')}
        maxWidth="lg"
      >
        {movementDialogOpen ? (
          <AdjustmentForm
            key={movementFormKey}
            variant="dialog"
            onDismiss={() => setMovementDialogOpen(false)}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

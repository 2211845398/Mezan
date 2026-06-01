import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateField } from '@/components/shared/form/DateField';
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
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { cn } from '@/lib/utils';

import { InventoryStockNavActions } from '../../components/InventoryStockNavActions';
import type { StockMovement } from '../../api';
import { useMovementsQuery } from '../../queries';
import { formatMovementKind, formatMovementReason } from '../../utils/movementLabels';
import AdjustmentForm from './AdjustmentForm';

export default function AdjustmentsList() {
  const { t } = useTranslation('inventory');
  const canCreate = usePermission('stock_adjustments', 'create');
  const { data: rows = [], isLoading, isError, refetch } = useMovementsQuery({ limit: 200, offset: 0 });

  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementFormKey, setMovementFormKey] = useState(0);
  const [branchFilter, setBranchFilter] = useState<number | null>(null);
  const [kindFilter, setKindFilter] = useState('__all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchDraft, setSearchDraft] = useState('');

  const kindOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.movement_kind?.trim()) set.add(r.movement_kind.trim());
    }
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = searchDraft.trim().toLowerCase();
    return rows.filter((r) => {
      if (branchFilter != null && r.branch_id !== branchFilter) return false;
      if (kindFilter !== '__all' && r.movement_kind !== kindFilter) return false;
      if (dateFrom) {
        const d = r.created_at ? String(r.created_at).slice(0, 10) : '';
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = r.created_at ? String(r.created_at).slice(0, 10) : '';
        if (d > dateTo) return false;
      }
      if (q) {
        const kindLabel = formatMovementKind(r.movement_kind, t);
        const reasonLabel = formatMovementReason(r.reason, t);
        const hay = [r.branch_name, r.product_name, kindLabel, reasonLabel, r.movement_kind, r.reason]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, branchFilter, kindFilter, dateFrom, dateTo, searchDraft, t]);

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
          cell: ({ row }) => formatMovementKind(row.original.movement_kind, t),
        },
        {
          id: 'reason',
          header: t('adjustments.col.reason'),
          cell: ({ row }) => formatMovementReason(row.original.reason, t),
        },
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
          <div className="flex flex-wrap gap-2">
            <InventoryStockNavActions
              onOpenMovementDialog={
                canCreate
                  ? () => {
                      setMovementFormKey((k) => k + 1);
                      setMovementDialogOpen(true);
                    }
                  : undefined
              }
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor="adj-search">{t('stock.search.label')}</Label>
          <Input
            id="adj-search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={t('stock.search.placeholder')}
          />
        </div>
        <div className="min-w-[12rem] flex-1 space-y-1">
          <BranchCombobox
            label={t('stock.filter.branch')}
            value={branchFilter}
            onChange={setBranchFilter}
            allowClear
            clearLabel={t('stock.filter.all_branches')}
            showCode={false}
          />
        </div>
        <div className="grid gap-1">
          <Label>{t('adjustments.filter.kind')}</Label>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('adjustments.filter.all_kinds')}</SelectItem>
              {kindOptions.map((k) => (
                <SelectItem key={k} value={k}>
                  {formatMovementKind(k, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('adjustments.filter.date_from')}</Label>
          <DateField value={dateFrom} onChange={setDateFrom} className="w-[160px]" />
        </div>
        <div className="grid gap-1">
          <Label>{t('adjustments.filter.date_to')}</Label>
          <DateField value={dateTo} onChange={setDateTo} className="w-[160px]" />
        </div>
        {(branchFilter != null || kindFilter !== '__all' || dateFrom || dateTo || searchDraft) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setBranchFilter(null);
              setKindFilter('__all');
              setDateFrom('');
              setDateTo('');
              setSearchDraft('');
            }}
          >
            {t('adjustments.filter.clear')}
          </Button>
        ) : null}
      </div>

      <DataTable
        mode="client"
        showSearch={false}
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

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { OpenItemRead } from '../../api';
import { apOpenItemsQueryOptions } from '../../queries';
import ApApplyPaymentDrawer from './ApApplyPaymentDrawer';

export default function ApOpenItems() {
  const { t } = useTranslation('accounting');
  const [branch, setBranch] = useState('__all');
  const [st, setSt] = useState<string>('open');
  const [sel, setSel] = useState<number[]>([]);
  const [openDr, setOpenDr] = useState(false);
  const canApply = usePermission('accounting', 'update');
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const b = branch === '__all' ? undefined : Number(branch);
  const statusQ = st === 'all' ? undefined : st;
  const apParams = useMemo(() => {
    const p: { branch_id?: number; status?: string } = {};
    if (b !== undefined) p.branch_id = b;
    if (statusQ !== undefined) p.status = statusQ;
    return p;
  }, [b, statusQ]);
  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    apOpenItemsQueryOptions(apParams),
  );

  const selectedItems = useMemo(
    () => rows.filter((r) => sel.includes(r.id)),
    [rows, sel],
  );

  const selectionTotal = useMemo(
    () => selectedItems.reduce((acc, r) => acc + Number(r.amount_open), 0),
    [selectedItems],
  );

  const columns = useMemo(
    () =>
      defineColumns<OpenItemRead>()([
        {
          id: 'x',
          header: '',
          cell: ({ row }) =>
            canApply && row.original.status === 'open' ? (
              <Checkbox
                checked={sel.includes(row.original.id)}
                onCheckedChange={(c) => {
                  const id = row.original.id;
                  setSel((s) => (c ? [...s, id] : s.filter((x) => x !== id)));
                }}
              />
            ) : null,
        },
        {
          id: 'ref',
          header: t('ap.col.ref'),
          cell: ({ row }) => (
            <span className="num-latin font-mono text-sm">
              {row.original.source_type}-{row.original.source_id}
            </span>
          ),
        },
        {
          id: 'desc',
          header: t('ap.col.description'),
          cell: ({ row }) => row.original.description ?? '—',
        },
        {
          id: 'doc_date',
          header: t('ap.col.doc_date'),
          cell: ({ row }) => row.original.document_date?.slice(0, 10) ?? '—',
        },
        {
          id: 'due_date',
          header: t('ap.col.due_date'),
          cell: ({ row }) => row.original.due_date?.slice(0, 10) ?? '—',
        },
        {
          id: 'overdue',
          header: t('ap.col.days_overdue'),
          cell: ({ row }) => {
            const d = row.original.days_overdue;
            if (d == null || d <= 0) return '—';
            return (
              <span className="font-medium text-destructive tabular-nums">{d}</span>
            );
          },
        },
        {
          id: 'open',
          header: t('ap.col.open'),
          cell: ({ row }) => (
            <span className="tabular-nums num-latin text-end block">
              {formatMoney(row.original.amount_open)}
            </span>
          ),
        },
        {
          id: 'st',
          accessorKey: 'status',
          header: t('ap.col.status'),
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.status}
              label={t(`ap.status.${row.original.status}`, row.original.status)}
            />
          ),
        },
      ]),
    [canApply, sel, t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('ap.title')} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('toolbar.branch')}</Label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('toolbar.all_branches')}</SelectItem>
              {branches.map((br) => (
                <SelectItem key={br.id} value={String(br.id)}>
                  {br.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('ap.filter_status')}</Label>
          <Select value={st} onValueChange={setSt}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{t('ap.status.open')}</SelectItem>
              <SelectItem value="closed">{t('ap.status.closed')}</SelectItem>
              <SelectItem value="all">{t('ap.status.all')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      {/* Sticky bulk action bar */}
      {canApply && sel.length > 0 ? (
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-4',
            'border-t bg-background/95 px-6 py-3 shadow-lg backdrop-blur-sm',
          )}
        >
          <p className="text-sm text-muted-foreground">
            {t('ap.selection_summary', { count: sel.length, total: formatMoney(selectionTotal) })}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSel([])}>
              {t('ap.deselect_all')}
            </Button>
            <Button type="button" size="sm" onClick={() => setOpenDr(true)}>
              {t('ap.apply_selected')}
            </Button>
          </div>
        </div>
      ) : null}

      <ApApplyPaymentDrawer open={openDr} onOpenChange={setOpenDr} items={selectedItems} />
    </div>
  );
}

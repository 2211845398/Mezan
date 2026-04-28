import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
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

import type { OpenItemRead } from '../../api';
import { arOpenItemsQueryOptions } from '../../queries';
import ArApplyPaymentDrawer from './ArApplyPaymentDrawer';

export default function AROpenItems() {
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
  const arParams = useMemo(() => {
    const p: { branch_id?: number; status?: string } = {};
    if (b !== undefined) p.branch_id = b;
    if (statusQ !== undefined) p.status = statusQ;
    return p;
  }, [b, statusQ]);
  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    arOpenItemsQueryOptions(arParams),
  );

  const selectedItems = useMemo(
    () => rows.filter((r) => sel.includes(r.id)),
    [rows, sel],
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
        { id: 'id', accessorKey: 'id', header: 'ID' },
        {
          id: 'open',
          header: t('ar.col.open'),
          cell: ({ row }) => String(row.original.amount_open),
        },
        { id: 'src', header: t('ar.col.source'), cell: ({ row }) => row.original.source_id },
        { id: 'st', accessorKey: 'status', header: t('ar.col.status') },
      ]),
    [canApply, sel, t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('ar.title')}</h1>
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
          <Label>{t('ar.filter_status')}</Label>
          <Select value={st} onValueChange={setSt}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{t('ar.status.open')}</SelectItem>
              <SelectItem value="closed">{t('ar.status.closed')}</SelectItem>
              <SelectItem value="all">{t('ar.status.all')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canApply && sel.length > 0 ? (
          <Button type="button" onClick={() => setOpenDr(true)}>
            {t('ar.apply_selected')}
          </Button>
        ) : null}
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
      <ArApplyPaymentDrawer open={openDr} onOpenChange={setOpenDr} items={selectedItems} />
    </div>
  );
}

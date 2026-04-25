import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DateField } from '@/components/shared/form/DateField';
import { DataTable, defineColumns } from '@/components/shared/DataTable';
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
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';

import type { TrialBalanceRow } from '../../api';
import { exportTrialBalanceCsvBlob } from '../../api';
import { trialBalanceQueryOptions } from '../../queries';

export default function TrialBalance() {
  const { t } = useTranslation('accounting');
  const t0 = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(t0);
  const [branch, setBranch] = useState('__all');
  const [applied, setApplied] = useState<{ as_of: string; branch_id?: number }>({ as_of: t0 });
  const canExport = usePermission('accounting', 'read');
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    trialBalanceQueryOptions(applied),
  );

  const totals = useMemo(() => {
    let dr = 0;
    let cr = 0;
    for (const r of rows) {
      dr += Number(r.total_debit);
      cr += Number(r.total_credit);
    }
    return { dr: dr.toFixed(2), cr: cr.toFixed(2) };
  }, [rows]);

  const columns = useMemo(
    () =>
      defineColumns<TrialBalanceRow>()([
        { id: 'code', accessorKey: 'code', header: t('tb.col.code') },
        { id: 'name', accessorKey: 'name', header: t('tb.col.name') },
        { id: 'type', accessorKey: 'account_type', header: t('tb.col.type') },
        { id: 'dr', header: t('tb.col.debit'), cell: ({ row }) => String(row.original.total_debit) },
        { id: 'cr', header: t('tb.col.credit'), cell: ({ row }) => String(row.original.total_credit) },
        { id: 'net', accessorKey: 'net', header: t('tb.col.net'), cell: ({ row }) => String(row.original.net) },
      ]),
    [t],
  );

  const apply = () => {
    const b = branch === '__all' ? undefined : Number(branch);
    setApplied(
      b === undefined ? { as_of: asOf } : { as_of: asOf, branch_id: b },
    );
  };

  const exportCsv = async () => {
    const b = branch === '__all' ? undefined : Number(branch);
    const blob = await exportTrialBalanceCsvBlob(
      b === undefined
        ? { as_of: applied.as_of }
        : { as_of: applied.as_of, branch_id: b },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trial_balance.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('tb.title')}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('tb.as_of')}</Label>
          <DateField value={asOf} onChange={setAsOf} />
        </div>
        <div className="grid gap-1">
          <Label>{t('toolbar.branch')}</Label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('toolbar.all_branches')}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={apply}>
          {t('toolbar.apply')}
        </Button>
        {canExport ? (
          <Button type="button" variant="outline" onClick={() => void exportCsv()}>
            {t('tb.export')}
          </Button>
        ) : null}
      </div>
      <p className="text-sm">
        {t('tb.totals', { dr: totals.dr, cr: totals.cr })}
      </p>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}

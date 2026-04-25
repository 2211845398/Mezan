import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { balanceSheetQueryOptions } from '../../queries';

function LinesTable({ title, rows }: { title: string; rows: { account_id: number; code: string; name: string; amount: string }[] }) {
  const { t } = useTranslation('accounting');
  return (
    <div>
      <h2 className="mb-2 font-medium">{title}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tb.col.code')}</TableHead>
            <TableHead>{t('tb.col.name')}</TableHead>
            <TableHead>{t('is.amount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.account_id}>
              <TableCell>{r.code}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function BalanceSheet() {
  const { t } = useTranslation('accounting');
  const d0 = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(d0);
  const [branch, setBranch] = useState('__all');
  const [applied, setApplied] = useState<{ as_of: string; branch_id?: number }>({ as_of: d0 });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data, isLoading } = useQuery(balanceSheetQueryOptions(applied));
  const apply = () => {
    const b = branch === '__all' ? undefined : Number(branch);
    setApplied(
      b === undefined ? { as_of: asOf } : { as_of: asOf, branch_id: b },
    );
  };

  if (isLoading && !data) return <div className="p-4">…</div>;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('bs.title')}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('bs.as_of')}</Label>
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
      </div>
      {data ? (
        <div className="space-y-6">
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">{t('bs.total_assets')}</div>
              <div className="text-lg font-medium">{String(data.total_assets)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('bs.imbalance')}</div>
              <div className="text-lg font-medium">{String(data.assets_minus_liabilities_equity)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('bs.total_liabilities')}</div>
              <div className="text-lg font-medium">{String(data.total_liabilities)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('bs.total_equity')}</div>
              <div className="text-lg font-medium">{String(data.total_equity)}</div>
            </div>
          </div>
          <LinesTable title={t('bs.section.assets')} rows={data.asset_lines ?? []} />
          <LinesTable title={t('bs.section.liabilities')} rows={data.liability_lines ?? []} />
          <LinesTable title={t('bs.section.equity')} rows={data.equity_lines ?? []} />
        </div>
      ) : null}
    </div>
  );
}

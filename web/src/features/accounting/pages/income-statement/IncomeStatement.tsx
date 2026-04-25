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

import { incomeStatementQueryOptions } from '../../queries';

function defaultIsPeriod() {
  const d = new Date();
  d.setDate(1);
  return { ps: d.toISOString().slice(0, 10), pe: new Date().toISOString().slice(0, 10) };
}

export default function IncomeStatement() {
  const { t } = useTranslation('accounting');
  const d0 = defaultIsPeriod();
  const [ps, setPs] = useState(d0.ps);
  const [pe, setPe] = useState(d0.pe);
  const [branch, setBranch] = useState('__all');
  const [applied, setApplied] = useState<{
    period_start: string;
    period_end: string;
    branch_id?: number;
  }>({ period_start: d0.ps, period_end: d0.pe });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data, isLoading } = useQuery(incomeStatementQueryOptions(applied));

  const apply = () => {
    const b = branch === '__all' ? undefined : Number(branch);
    setApplied(
      b === undefined
        ? { period_start: ps, period_end: pe }
        : { period_start: ps, period_end: pe, branch_id: b },
    );
  };

  if (isLoading && !data) return <div className="p-4">…</div>;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('is.title')}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('is.period_start')}</Label>
          <DateField value={ps} onChange={setPs} />
        </div>
        <div className="grid gap-1">
          <Label>{t('is.period_end')}</Label>
          <DateField value={pe} onChange={setPe} />
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
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {data.period_start} → {data.period_end}
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">{t('is.revenue')}</div>
              <div className="text-lg font-medium">{String(data.total_revenue)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('is.expense')}</div>
              <div className="text-lg font-medium">{String(data.total_expense)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('is.net_income')}</div>
              <div className="text-lg font-medium">{String(data.net_income)}</div>
            </div>
          </div>
          <h2 className="font-medium">{t('is.revenue_lines')}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tb.col.code')}</TableHead>
                <TableHead>{t('tb.col.name')}</TableHead>
                <TableHead>{t('is.amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.revenue_lines ?? []).map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell>{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{String(r.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <h2 className="font-medium">{t('is.expense_lines')}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tb.col.code')}</TableHead>
                <TableHead>{t('tb.col.name')}</TableHead>
                <TableHead>{t('is.amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.expense_lines ?? []).map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell>{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{String(r.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

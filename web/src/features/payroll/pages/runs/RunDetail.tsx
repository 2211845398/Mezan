import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermission } from '@/hooks/usePermission';
import { newIdempotencyKey } from '@/lib/idempotency';

import { approvePayslip, exportPayrollCsvBlob, patchPayslipAdjustments, recalculatePayslip } from '../../api';
import { payrollKeys, payslipQueryOptions } from '../../queries';

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const pid = id ? Number(id) : NaN;
  const { t } = useTranslation('payroll');
  const qc = useQueryClient();
  const canApprove = usePermission('payroll', 'approve');
  const canCreate = usePermission('payroll', 'create');
  const canExport = usePermission('payroll', 'export');

  const [bonusAdj, setBonusAdj] = useState('');
  const [manualAdj, setManualAdj] = useState('');

  const { data: ps, refetch, isLoading } = useQuery({
    ...payslipQueryOptions(pid),
    enabled: !Number.isNaN(pid),
  });

  useEffect(() => {
    if (!ps) return;
    setBonusAdj(ps.bonus_amount != null && ps.bonus_amount !== '' ? String(ps.bonus_amount) : '');
    setManualAdj(
      ps.manual_deductions_amount != null && ps.manual_deductions_amount !== ''
        ? String(ps.manual_deductions_amount)
        : '',
    );
  }, [ps]);

  const appr = useMutation({
    mutationFn: () => {
      const idem = newIdempotencyKey();
      return approvePayslip({ payslip_id: pid, idempotency_key: idem }, idem);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: payrollKeys.root });
      toast.success(t('actions.approved_ok'));
      void refetch();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const recalc = useMutation({
    mutationFn: () => recalculatePayslip(pid),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: payrollKeys.root });
      toast.success(t('actions.recalc_ok'));
      void refetch();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const blob = await exportPayrollCsvBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = t('export.filename');
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const patchAdj = useMutation({
    mutationFn: () =>
      patchPayslipAdjustments(pid, {
        bonus_amount: bonusAdj.trim() === '' ? null : bonusAdj,
        manual_deductions: manualAdj.trim() === '' ? null : manualAdj,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: payrollKeys.root });
      toast.success(t('run.adjust_saved'));
      void refetch();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  if (Number.isNaN(pid)) return null;
  if (isLoading || !ps) return <div className="p-4">…</div>;

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {t('run.title', { id: ps.id })}
        </h1>
        <Button variant="outline" asChild>
          <Link to="/payroll/runs">{t('runs.title')}</Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {canCreate && ps.status === 'draft' ? (
          <Button type="button" variant="secondary" disabled={recalc.isPending} onClick={() => void recalc.mutate()}>
            {t('actions.recalculate')}
          </Button>
        ) : null}
        {canApprove && ps.status === 'draft' ? (
          <Button type="button" disabled={appr.isPending} onClick={() => void appr.mutate()}>
            {t('actions.approve')}
          </Button>
        ) : null}
        {canExport ? (
          <Button type="button" variant="outline" disabled={exportCsv.isPending} onClick={() => void exportCsv.mutate()}>
            {t('actions.export_csv')}
          </Button>
        ) : null}
      </div>
      <div className="grid max-w-xl gap-2 rounded-md border p-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('run.col.base_salary')}</span>
          <span className="font-medium tabular-nums">{ps.base_salary_amount ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('run.col.bonus')}</span>
          <span className="font-medium tabular-nums">{ps.bonus_amount ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('run.col.overtime')}</span>
          <span className="font-medium tabular-nums">{ps.overtime_amount ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('run.col.auto_deductions')}</span>
          <span className="font-medium tabular-nums">{ps.automatic_deductions_amount ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('run.col.manual_deductions')}</span>
          <span className="font-medium tabular-nums">{ps.manual_deductions_amount ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('run.col.paid_at')}</span>
          <span className="font-medium">{ps.paid_at ?? '—'}</span>
        </div>
      </div>
      {canCreate && ps.status === 'draft' ? (
        <div className="grid max-w-xl gap-3 rounded-md border p-4">
          <div className="font-medium">{t('run.adjustments_title')}</div>
          <div className="grid gap-1">
            <Label>{t('run.col.bonus')}</Label>
            <MoneyInput value={bonusAdj} onChange={setBonusAdj} />
          </div>
          <div className="grid gap-1">
            <Label>{t('run.col.manual_deductions')}</Label>
            <MoneyInput value={manualAdj} onChange={setManualAdj} />
          </div>
          <Button type="button" disabled={patchAdj.isPending} onClick={() => void patchAdj.mutate()}>
            {t('run.save_adjustments')}
          </Button>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('col.employee')}</TableHead>
            <TableHead>{t('col.period')}</TableHead>
            <TableHead>{t('col.hours')}</TableHead>
            <TableHead>{t('col.rate')}</TableHead>
            <TableHead>{t('col.gross')}</TableHead>
            <TableHead>{t('col.deductions')}</TableHead>
            <TableHead>{t('col.net')}</TableHead>
            <TableHead>{t('col.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>{ps.employee_profile_id}</TableCell>
            <TableCell>
              {ps.period_start} → {ps.period_end}
            </TableCell>
            <TableCell>{String(ps.hours_worked)}</TableCell>
            <TableCell>{String(ps.hourly_rate)}</TableCell>
            <TableCell>{String(ps.gross_amount)}</TableCell>
            <TableCell>{String(ps.deductions)}</TableCell>
            <TableCell>{String(ps.net_amount)}</TableCell>
            <TableCell>{ps.status}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

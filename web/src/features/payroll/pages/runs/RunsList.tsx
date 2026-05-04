import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { newIdempotencyKey } from '@/lib/idempotency';

import type { PayslipRead } from '../../api';
import { generatePayslip } from '../../api';
import { payrollKeys, payslipsQueryOptions } from '../../queries';

function statusLabel(s: string, t: (k: string) => string): string {
  if (s === 'draft') return t('status.calculated');
  if (s === 'approved') return t('status.approved');
  return s;
}

export default function RunsList() {
  const { t } = useTranslation('payroll');
  const qc = useQueryClient();
  const canCreate = usePermission('payroll', 'create');
  const [empId, setEmpId] = useState('');
  const [ps, setPs] = useState('');
  const [pe, setPe] = useState('');
  const [ded, setDed] = useState('0');

  const { data: rows = [], isLoading, isError, refetch } = useQuery(payslipsQueryOptions());

  const gen = useMutation({
    mutationFn: async () => {
      const idem = newIdempotencyKey();
      return generatePayslip(
        {
          employee_profile_id: Number(empId),
          period_start: ps,
          period_end: pe,
          deductions: ded as never,
        },
        idem,
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: payrollKeys.root });
      toast.success(t('actions.gen_ok'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const columns = useMemo(
    () =>
      defineColumns<PayslipRead>()([
        { id: 'id', accessorKey: 'id', header: t('col.id') },
        {
          id: 'emp',
          header: t('col.employee'),
          cell: ({ row }) => row.original.employee_profile_id,
        },
        {
          id: 'period',
          header: t('col.period'),
          cell: ({ row }) =>
            `${row.original.period_start} → ${row.original.period_end}`,
        },
        {
          id: 'status',
          header: t('col.status'),
          cell: ({ row }) => statusLabel(row.original.status, t),
        },
        {
          id: 'net',
          header: t('col.net'),
          cell: ({ row }) => String(row.original.net_amount),
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="icon" variant="ghost" asChild>
              <Link to={`/payroll/runs/${row.original.id}`} aria-label={t('actions.detail')}>
                <Eye className="size-4" />
              </Link>
            </Button>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('runs.title')}</h1>
      </div>
      {canCreate ? (
        <div className="grid max-w-xl gap-2 rounded-md border p-4">
          <div className="font-medium">{t('runs.generate_section')}</div>
          <div className="grid gap-1">
            <Label>{t('form.emp_id')}</Label>
            <Input value={empId} onChange={(e) => setEmpId(e.target.value)} inputMode="numeric" />
          </div>
          <div className="grid gap-1">
            <Label>{t('form.period_start')}</Label>
            <DateField value={ps} onChange={setPs} />
          </div>
          <div className="grid gap-1">
            <Label>{t('form.period_end')}</Label>
            <DateField value={pe} onChange={setPe} />
          </div>
          <div className="grid gap-1">
            <Label>{t('form.deductions')}</Label>
            <MoneyInput value={ded} onChange={setDed} />
          </div>
          <Button
            type="button"
            disabled={gen.isPending || !empId || !ps || !pe}
            onClick={() => void gen.mutate()}
          >
            <Plus className="me-2 size-4" />
            {t('actions.generate')}
          </Button>
        </div>
      ) : null}
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

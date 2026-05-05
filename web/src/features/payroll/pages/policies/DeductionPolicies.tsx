import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { roleCodeLabel } from '@/features/admin/lib/roleLabels';
import { usePermission } from '@/hooks/usePermission';

import type { AttendancePayrollPolicyRead, AttendancePayrollPolicyUpsert } from '../../api';
import { upsertAttendancePayrollPolicy } from '../../api';
import { attendancePayrollPoliciesQueryOptions, payrollKeys } from '../../queries';

const CATEGORIES = ['exempt', 'office', 'operational'] as const;

export default function DeductionPolicies() {
  const { t } = useTranslation('payroll');
  const { t: tHr } = useTranslation('hr');
  const { t: tAdmin } = useTranslation('admin');
  const qc = useQueryClient();
  const canEdit = usePermission('payroll', 'create');
  const { data: policies = [], isLoading, isError, refetch } = useQuery(attendancePayrollPoliciesQueryOptions());

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AttendancePayrollPolicyRead | null>(null);
  const [form, setForm] = useState<AttendancePayrollPolicyUpsert>({
    attendance_category: 'office',
    grace_minutes: 30,
    absence_deduction_amount: '0',
    late_deduction_amount: '0',
    early_close_deduction_amount: '0',
    overtime_multiplier: '1.5',
    is_active: true,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      return upsertAttendancePayrollPolicy(editing.role_code, form);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: payrollKeys.policies() });
      toast.success(t('policies.saved'));
      setOpen(false);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const columns = useMemo(
    () =>
      defineColumns<AttendancePayrollPolicyRead>()([
        {
          id: 'role',
          header: t('policies.col.role'),
          accessorFn: (row) => {
            const code = row.role_code;
            const label = roleCodeLabel(tAdmin, code, code);
            return `${code} ${label}`;
          },
          cell: ({ row }) => roleCodeLabel(tAdmin, row.original.role_code, row.original.role_code),
        },
        {
          id: 'cat',
          header: t('policies.col.category'),
          accessorFn: (row) => {
            const c = row.attendance_category;
            const label = tHr(`attendance.category.${c}`, { defaultValue: c });
            return `${c} ${label}`;
          },
          cell: ({ row }) =>
            tHr(`attendance.category.${row.original.attendance_category}`, {
              defaultValue: row.original.attendance_category,
            }),
        },
        { id: 'grace', accessorKey: 'grace_minutes', header: t('policies.col.grace') },
        {
          id: 'abs',
          header: t('policies.col.absence'),
          cell: ({ row }) => row.original.absence_deduction_amount,
        },
        {
          id: 'late',
          header: t('policies.col.late'),
          cell: ({ row }) => row.original.late_deduction_amount,
        },
        {
          id: 'early',
          header: t('policies.col.early'),
          cell: ({ row }) => row.original.early_close_deduction_amount,
        },
        {
          id: 'otm',
          header: t('policies.col.ot_mult'),
          cell: ({ row }) => row.original.overtime_multiplier,
        },
        {
          id: 'act',
          header: '',
          enableGlobalFilter: false,
          cell: ({ row }) =>
            canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(row.original);
                  setForm({
                    attendance_category: row.original.attendance_category as 'exempt' | 'office' | 'operational',
                    grace_minutes: row.original.grace_minutes,
                    absence_deduction_amount: row.original.absence_deduction_amount,
                    late_deduction_amount: row.original.late_deduction_amount,
                    early_close_deduction_amount: row.original.early_close_deduction_amount,
                    overtime_multiplier: row.original.overtime_multiplier,
                    is_active: row.original.is_active,
                  });
                  setOpen(true);
                }}
              >
                {t('policies.edit')}
              </Button>
            ) : null,
        },
      ]),
    [canEdit, t, tAdmin, tHr],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('policies.title')} />
      <DataTable
        mode="client"
        columns={columns}
        data={policies}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" motionless>
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle>
              {t('policies.edit_title', {
                role: editing
                  ? roleCodeLabel(tAdmin, editing.role_code, editing.role_code)
                  : '',
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>{t('policies.form.category')}</Label>
              <Select
                value={form.attendance_category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, attendance_category: v as AttendancePayrollPolicyUpsert['attendance_category'] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {tHr(`attendance.category.${c}`, { defaultValue: c })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>{t('policies.form.grace')}</Label>
              <Input
                type="number"
                value={form.grace_minutes}
                onChange={(e) => setForm((f) => ({ ...f, grace_minutes: Number(e.target.value) }))}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t('policies.form.absence')}</Label>
              <Input
                value={form.absence_deduction_amount}
                onChange={(e) => setForm((f) => ({ ...f, absence_deduction_amount: e.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t('policies.form.late')}</Label>
              <Input
                value={form.late_deduction_amount}
                onChange={(e) => setForm((f) => ({ ...f, late_deduction_amount: e.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t('policies.form.early')}</Label>
              <Input
                value={form.early_close_deduction_amount}
                onChange={(e) => setForm((f) => ({ ...f, early_close_deduction_amount: e.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t('policies.form.ot_mult')}</Label>
              <Input
                value={form.overtime_multiplier}
                onChange={(e) => setForm((f) => ({ ...f, overtime_multiplier: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="mt-auto flex-row gap-2 sm:justify-center">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('policies.cancel')}
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => void save.mutate()}>
              {t('policies.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

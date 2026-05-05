import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { getApiErrorMessage, notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { RoleCodeCombobox } from '@/features/admin/components/RoleCodeCombobox';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';
import RouteLoader from '@/routes/RouteLoader';

import { updateEmployee } from '../../api';
import { employeeQueryOptions, hrKeys } from '../../queries';

const formSchema = z
  .object({
    subject_full_name: z.string().max(255),
    subject_branch_id: z.number().int().positive().nullable(),
    subject_role_code: z.string(),
    hire_date: z.string().min(1),
    base_salary: z.string().optional(),
    hourly_rate: z.string().optional(),
    bank_account: z.string().max(64).optional().nullable(),
    annual_leave_entitlement_days: z.string().optional(),
  })
  .refine((d) => (d.base_salary && d.base_salary !== '') || (d.hourly_rate && d.hourly_rate !== ''), {
    message: 'base_or_hourly',
    path: ['hourly_rate'],
  })
  .refine(
    (d) => {
      const s = d.annual_leave_entitlement_days?.trim();
      if (!s) return true;
      const n = Number(s);
      return !Number.isNaN(n) && n >= 0;
    },
    { message: 'annual_leave_invalid', path: ['annual_leave_entitlement_days'] },
  );

type FormValues = z.infer<typeof formSchema>;

export default function EmployeeData() {
  const { id } = useParams<{ id: string }>();
  const eid = Number(id);
  const { t } = useTranslation('hr');
  const { t: tc } = useTranslation('common');
  const { t: tAdmin } = useTranslation('admin');
  const qc = useQueryClient();
  const canUpdate = usePermission('employees', 'update');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: existing, isLoading, isError } = useQuery({
    ...employeeQueryOptions(eid),
    enabled: !Number.isNaN(eid),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subject_full_name: '',
      subject_branch_id: null,
      subject_role_code: '',
      hire_date: '',
      base_salary: '',
      hourly_rate: '',
      bank_account: '',
      annual_leave_entitlement_days: '',
    },
  });

  useEffect(() => {
    if (!existing) return;
    form.reset({
      subject_full_name: existing.user_full_name ?? '',
      subject_branch_id: existing.user_branch_id ?? null,
      subject_role_code: (existing.user_role_code ?? '').trim(),
      hire_date: existing.hire_date?.slice(0, 10) ?? '',
      base_salary: existing.base_salary != null ? String(existing.base_salary) : '',
      hourly_rate: existing.hourly_rate != null ? String(existing.hourly_rate) : '',
      bank_account: existing.bank_account ?? '',
      annual_leave_entitlement_days:
        existing.annual_leave_entitlement_days != null && existing.annual_leave_entitlement_days !== ''
          ? String(existing.annual_leave_entitlement_days)
          : '',
    });
  }, [existing, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const base = v.base_salary?.trim() ? v.base_salary : null;
      const hr = v.hourly_rate?.trim() ? v.hourly_rate : null;
      const rc = v.subject_role_code.trim().toUpperCase();
      const payload: Parameters<typeof updateEmployee>[1] = {
        hire_date: v.hire_date,
        base_salary: base,
        hourly_rate: hr,
        bank_account: v.bank_account?.trim() || null,
        subject_full_name: v.subject_full_name.trim() ? v.subject_full_name.trim() : null,
        subject_branch_id: v.subject_branch_id ?? null,
      };
      const al = v.annual_leave_entitlement_days?.trim();
      payload.annual_leave_entitlement_days = al && al !== '' ? Number(al) : null;
      if (rc) {
        payload.subject_role_code = rc;
      }
      return updateEmployee(eid, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: hrKeys.employee(eid) });
      await qc.invalidateQueries({ queryKey: hrKeys.root });
      notify.success(tc('toasts.saved'));
      setFormError(null);
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  if (!Number.isFinite(eid) || isError) {
    return <p className="p-4 text-destructive">{t('hr_errors.generic')}</p>;
  }
  if (isLoading || !existing) {
    return <RouteLoader />;
  }

  const statusRaw = existing.user_status ?? '';
  const statusLabel = statusRaw
    ? tAdmin(`users.user_status.${statusRaw}`, { defaultValue: statusRaw })
    : '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('tracking.data_title')}
        actions={<BackButton to={`/hr/employees/${eid}/performance`} label={t('tracking.performance')} />}
      />

      <form
        className="space-y-6"
        onSubmit={form.handleSubmit(
          async (v) => {
            if (!canUpdate) return;
            setFormError(null);
            try {
              await save.mutateAsync(v);
            } catch (error) {
              setFormError(getApiErrorMessage(error, t('hr_errors.generic')));
            }
          },
          (errs) => {
            if (errs.hourly_rate?.message === 'base_or_hourly') {
              toast.error(t('employees.form.base_or_hourly'));
            }
            if (errs.annual_leave_entitlement_days?.message === 'annual_leave_invalid') {
              toast.error(t('employees.form.annual_leave_invalid'));
            }
          },
        )}
      >
        <SectionCard>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="emp-subject-name">{tAdmin('users.col.full_name')}</Label>
              <Input
                id="emp-subject-name"
                {...form.register('subject_full_name')}
                disabled={!canUpdate}
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-email">{tAdmin('users.col.email')}</Label>
              <Input
                id="emp-email"
                value={existing.user_email ?? ''}
                readOnly
                tabIndex={-1}
                className="cursor-default bg-muted/50"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-role">{tAdmin('users.col.role')}</Label>
              <Controller
                control={form.control}
                name="subject_role_code"
                render={({ field }) => (
                  <RoleCodeCombobox
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!canUpdate}
                  />
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-branch">{tAdmin('users.col.branch')}</Label>
              <Controller
                control={form.control}
                name="subject_branch_id"
                render={({ field }) => (
                  <BranchCombobox
                    id="emp-branch"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!canUpdate}
                  />
                )}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="emp-status">{tAdmin('users.col.status')}</Label>
              <Input
                id="emp-status"
                value={statusLabel}
                readOnly
                tabIndex={-1}
                className="cursor-default bg-muted/50"
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('tracking.data_compensation')}>
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label>{t('employees.form.hire_date')}</Label>
              <DateField
                value={form.watch('hire_date')}
                onChange={(d) => form.setValue('hire_date', d)}
                disabled={!canUpdate}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('employees.form.base_salary')}</Label>
              <MoneyInput
                value={form.watch('base_salary') ?? ''}
                onChange={(s) => form.setValue('base_salary', s)}
                disabled={!canUpdate}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('employees.form.hourly_rate')}</Label>
              <MoneyInput
                value={form.watch('hourly_rate') ?? ''}
                onChange={(s) => form.setValue('hourly_rate', s)}
                disabled={!canUpdate}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('employees.form.compensation_hint')}</p>
            <div className="grid gap-2">
              <Label htmlFor="bank-data">{t('employees.form.bank')}</Label>
              <Input id="bank-data" {...form.register('bank_account')} disabled={!canUpdate} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="annual-leave">{t('employees.form.annual_leave_entitlement')}</Label>
              <Input
                id="annual-leave"
                type="text"
                inputMode="decimal"
                {...form.register('annual_leave_entitlement_days')}
                disabled={!canUpdate}
                placeholder={t('employees.form.annual_leave_placeholder')}
              />
              <p className="text-xs text-muted-foreground">{t('employees.form.annual_leave_hint')}</p>
            </div>
            {formError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            {canUpdate ? (
              <Button type="submit" disabled={save.isPending}>
                {t('employees.form.save')}
              </Button>
            ) : null}
          </div>
        </SectionCard>
      </form>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { RoleCodeCombobox } from '@/features/admin/components/RoleCodeCombobox';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import RouteLoader from '@/routes/RouteLoader';

import { updateEmployee, uploadEmployeeIdentityDocumentImage } from '../../api';
import { employeeQueryOptions, hrKeys } from '../../queries';

const formSchema = z
  .object({
    subject_first_name: z.string().max(255),
    subject_father_name: z.string().max(255),
    subject_family_name: z.string().max(255),
    subject_branch_id: z.number().int().positive().nullable(),
    subject_role_code: z.string(),
    hire_date: z.string().min(1),
    base_salary: z.string().optional(),
    hourly_rate: z.string().optional(),
    bank_account: z.string().max(64).optional().nullable(),
    annual_leave_entitlement_days: z.string().optional(),
    identity_document_type: z.string().max(32),
    identity_document_number: z.string().max(128),
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
  const { t, i18n } = useTranslation('hr');
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
      subject_first_name: '',
      subject_father_name: '',
      subject_family_name: '',
      subject_branch_id: null,
      subject_role_code: '',
      hire_date: '',
      base_salary: '',
      hourly_rate: '',
      bank_account: '',
      annual_leave_entitlement_days: '',
      identity_document_type: '',
      identity_document_number: '',
    },
  });

  useEffect(() => {
    if (!existing) return;
    form.reset({
      subject_first_name: existing.user_first_name ?? '',
      subject_father_name: existing.user_father_name ?? '',
      subject_family_name: existing.user_family_name ?? '',
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
      identity_document_type: existing.identity_document_type ?? '',
      identity_document_number: existing.identity_document_number ?? '',
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
        subject_first_name: v.subject_first_name.trim() ? v.subject_first_name.trim() : null,
        subject_father_name: v.subject_father_name.trim() ? v.subject_father_name.trim() : null,
        subject_family_name: v.subject_family_name.trim() ? v.subject_family_name.trim() : null,
        subject_branch_id: v.subject_branch_id ?? null,
      };
      const al = v.annual_leave_entitlement_days?.trim();
      payload.annual_leave_entitlement_days = al && al !== '' ? Number(al) : null;
      payload.identity_document_type = v.identity_document_type.trim() || null;
      payload.identity_document_number = v.identity_document_number.trim() || null;
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

  const idFileInputRef = useRef<HTMLInputElement>(null);
  const uploadIdScan = useMutation({
    mutationFn: (file: File) => uploadEmployeeIdentityDocumentImage(eid, file),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: hrKeys.employee(eid) });
      notify.success(t('employees.form.identity_scan_uploaded'));
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
              <Label htmlFor="emp-subject-fn">{tAdmin('users.col.first_name')}</Label>
              <Input id="emp-subject-fn" {...form.register('subject_first_name')} disabled={!canUpdate} autoComplete="given-name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-subject-father">{tAdmin('users.col.father_name')}</Label>
              <Input
                id="emp-subject-father"
                {...form.register('subject_father_name')}
                disabled={!canUpdate}
                autoComplete="additional-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-subject-family">{tAdmin('users.col.family_name')}</Label>
              <Input
                id="emp-subject-family"
                {...form.register('subject_family_name')}
                disabled={!canUpdate}
                autoComplete="family-name"
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

        <SectionCard title={t('employees.form.identity_section_title')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2" dir={i18n.dir()}>
              <Label>{t('employees.form.identity_document_type')}</Label>
              <Controller
                control={form.control}
                name="identity_document_type"
                render={({ field }) => (
                  <Select
                    value={field.value || '__none__'}
                    onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                    disabled={!canUpdate || uploadIdScan.isPending}
                  >
                    <SelectTrigger dir={i18n.dir()}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent dir={i18n.dir()}>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="passport">{t('employees.form.identity_doc_passport')}</SelectItem>
                      <SelectItem value="national_id">{t('employees.form.identity_doc_national_id')}</SelectItem>
                      <SelectItem value="residency">{t('employees.form.identity_doc_residency')}</SelectItem>
                      <SelectItem value="other">{t('employees.form.identity_doc_other')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-id-doc-number">{t('employees.form.identity_document_number')}</Label>
              <Input
                id="emp-id-doc-number"
                {...form.register('identity_document_number')}
                disabled={!canUpdate}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>{t('employees.form.identity_document_image')}</Label>
              <input
                ref={idFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f && canUpdate) void uploadIdScan.mutateAsync(f);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canUpdate || uploadIdScan.isPending || save.isPending}
                  onClick={() => idFileInputRef.current?.click()}
                >
                  {t('employees.form.identity_document_choose')}
                </Button>
              </div>
              {existing.identity_document_image_url ? (
                <div className="mt-2 grid gap-2">
                  <p className="text-xs text-muted-foreground">{t('employees.form.identity_document_preview')}</p>
                  <a
                    href={resolveMediaUrl(existing.identity_document_image_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block max-w-xs"
                  >
                    <img
                      src={resolveMediaUrl(existing.identity_document_image_url)}
                      alt=""
                      className="max-h-40 rounded-md border object-contain"
                    />
                  </a>
                </div>
              ) : null}
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

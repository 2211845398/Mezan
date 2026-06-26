import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, type FieldErrors, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { getApiErrorMessage, notifyApiError } from '@/api/errorMessages';
import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import { cn } from '@/lib/utils';
import { focusFirstFormError, useFormValidationDisplay } from '@/lib/formValidation';
import { readOnlyTextInputProps } from '@/lib/readOnlyFieldStyles';
import { useEditableFormMode } from '@/lib/useEditableFormMode';
import { FormContainer, SectionCard } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { ReadOnlyCopyableField } from '@/components/shared/form/ReadOnlyCopyableField';
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
import { listBranches } from '@/features/admin/api';
import { usersPickerQueryOptions } from '@/features/admin/queries';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import {
  createEmployee,
  createSchedule,
  updateEmployee,
} from '../../api';
import { isValidLibyanIban, normalizeLibyanIban } from '../../lib/libyanIban';
import { collectHrValidationToasts, EMPLOYEE_FORM_FIELD_ORDER } from '../../lib/hrFormValidationUi';
import { employeeQueryOptions, hrKeys, schedulesQueryOptions } from '../../queries';

const schema = z
  .object({
    user_id: z.coerce.number().int().positive(),
    hire_date: z.string().min(1),
    base_salary: z.string().optional(),
    hourly_rate: z.string().optional(),
    bank_account: z.string().max(64).optional().nullable(),
  })
  .refine((d) => (d.base_salary && d.base_salary !== '') || (d.hourly_rate && d.hourly_rate !== ''), {
    message: 'base_or_hourly',
    path: ['hourly_rate'],
  })
  .superRefine((data, ctx) => {
    const bank = data.bank_account?.trim() ?? '';
    if (bank && !isValidLibyanIban(bank)) {
      ctx.addIssue({ code: 'custom', message: 'iban_invalid', path: ['bank_account'] });
    }
  });

type FormValues = z.infer<typeof schema>;

const weekdays = [0, 1, 2, 3, 4, 5, 6] as const;

const EMPLOYEE_EDIT_FORM_ID = 'hr-employee-edit-form';

export default function EmployeeForm() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('hr');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = id === 'new';
  const eid = id && !isNew ? Number(id) : NaN;
  const canUpdate = usePermission('employees', 'update');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: users = [] } = useQuery(usersPickerQueryOptions());
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const defaultBranchId = branches[0]?.id ?? 1;

  const { data: existing } = useQuery({
    ...employeeQueryOptions(eid),
    enabled: !isNew && !Number.isNaN(eid),
  });
  const { data: sched = [], refetch: refetchSched } = useQuery({
    ...schedulesQueryOptions(eid),
    enabled: !isNew && !Number.isNaN(eid),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      user_id: 0,
      hire_date: '',
      base_salary: '',
      hourly_rate: '',
      bank_account: '',
    },
  });

  const vd = useFormValidationDisplay(form.control);
  const editMode = useEditableFormMode({
    form,
    canEdit: canUpdate,
    isCreate: isNew,
  });
  const fieldsEnabled = editMode.fieldsEnabled;
  const textRo = (extra?: string) => readOnlyTextInputProps(fieldsEnabled, extra);

  const userIdValue = form.watch('user_id');
  const linkedUserLabel = useMemo(() => {
    if (!userIdValue) return '—';
    const linked = users.find((u) => u.id === userIdValue);
    return linked ? `${linked.email} (#${linked.id})` : `#${userIdValue}`;
  }, [userIdValue, users]);

  const onInvalid = (errs: FieldErrors<FormValues>) => {
    for (const msg of collectHrValidationToasts(errs, t, tc, EMPLOYEE_FORM_FIELD_ORDER)) {
      toast.error(msg);
    }
    focusFirstFormError(form, errs, EMPLOYEE_FORM_FIELD_ORDER);
  };

  useEffect(() => {
    if (!existing) return;
    form.reset({
      user_id: existing.user_id,
      hire_date: existing.hire_date?.slice(0, 10) ?? '',
      base_salary: existing.base_salary != null ? String(existing.base_salary) : '',
      hourly_rate: existing.hourly_rate != null ? String(existing.hourly_rate) : '',
      bank_account: existing.bank_account ?? '',
    });
    if (!isNew) {
      editMode.syncSnapshot();
    }
  }, [existing, form, isNew, editMode.syncSnapshot]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const base = v.base_salary?.trim() ? v.base_salary : null;
      const hr = v.hourly_rate?.trim() ? v.hourly_rate : null;
      if (isNew) {
        return createEmployee({
          user_id: v.user_id,
          hire_date: v.hire_date,
          base_salary: base,
          hourly_rate: hr,
          bank_account: v.bank_account?.trim() ? normalizeLibyanIban(v.bank_account.trim()) : null,
        });
      }
      return updateEmployee(eid, {
        hire_date: v.hire_date,
        base_salary: base,
        hourly_rate: hr,
        bank_account: v.bank_account?.trim() ? normalizeLibyanIban(v.bank_account.trim()) : null,
      });
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: hrKeys.root });
      toast.success(t('employees.form.saved'));
      setFormError(null);
      if (isNew) {
        navigate(`/hr/employees/${row.id}/data`, { replace: true });
      } else {
        editMode.finishEdit();
      }
    },
  });

  const addDayOff = useMutation({
    mutationFn: async (weekday: number) => {
      return createSchedule(eid, {
        branch_id: defaultBranchId,
        weekday,
        start_time: '09:00:00',
        end_time: '17:00:00',
        is_day_off: true,
      });
    },
    onSuccess: () => {
      void refetchSched();
      void qc.invalidateQueries({ queryKey: hrKeys.schedules(eid) });
      notify.success(tc('toasts.saved'));
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  return (
    <FormContainer maxWidth="lg">
      <div className="flex flex-col gap-6">
        <PageHeader
          title={isNew ? t('employees.new') : t('employees.edit')}
          actions={
            <>
              <BackButton to="/hr/employees" label={t('employees.title')} />
              <DetailFormActionBar
                isEditing={editMode.isEditing}
                isCreate={isNew}
                canEdit={canUpdate}
                isSubmitting={save.isPending}
                formId={EMPLOYEE_EDIT_FORM_ID}
                onStartEdit={editMode.startEdit}
                onCancelEdit={editMode.cancelEdit}
              />
            </>
          }
        />

        <SectionCard>
          <form
            id={EMPLOYEE_EDIT_FORM_ID}
            className="flex flex-col gap-4"
            dir={i18n.dir()}
            onKeyDown={handleFormEnterSubmit}
            onSubmit={form.handleSubmit(
              async (v) => {
                setFormError(null);
                try {
                  await save.mutateAsync(v);
                } catch (error) {
                  setFormError(getApiErrorMessage(error, t('hr_errors.generic')));
                }
              },
              onInvalid,
            )}
          >
            <fieldset disabled={save.isPending} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label>{t('employees.form.user')}</Label>
              <Controller
                control={form.control}
                name="user_id"
                render={({ field }) =>
                  isNew && fieldsEnabled ? (
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <SelectTrigger
                        name="user_id"
                        className={vd.invalidClass('user_id')}
                        aria-invalid={vd.ariaInvalid('user_id')}
                      >
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {u.email} (#{u.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <ReadOnlyCopyableField value={linkedUserLabel} dir={i18n.dir()} />
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hire_date">{t('employees.form.hire_date')}</Label>
              <Controller
                control={form.control}
                name="hire_date"
                render={({ field }) => (
                  <DateField
                    id="hire_date"
                    name="hire_date"
                    value={field.value}
                    onChange={field.onChange}
                    readOnly={!fieldsEnabled}
                    invalid={vd.showError('hire_date')}
                  />
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="base_salary">{t('employees.form.base_salary')}</Label>
              <Controller
                control={form.control}
                name="base_salary"
                render={({ field }) => (
                  <MoneyInput
                    name="base_salary"
                    id="base_salary"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    readOnly={textRo().readOnly}
                    disabled={textRo().disabled}
                    tabIndex={textRo().tabIndex}
                    className={textRo().className}
                    invalid={vd.showError('base_salary')}
                  />
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hourly_rate">{t('employees.form.hourly_rate')}</Label>
              <Controller
                control={form.control}
                name="hourly_rate"
                render={({ field }) => (
                  <MoneyInput
                    name="hourly_rate"
                    id="hourly_rate"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    readOnly={textRo().readOnly}
                    disabled={textRo().disabled}
                    tabIndex={textRo().tabIndex}
                    className={textRo().className}
                    invalid={vd.showError('hourly_rate')}
                  />
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('employees.form.compensation_hint')}</p>
            <div className="grid gap-2">
              <Label htmlFor="bank">{t('employees.form.bank')}</Label>
              <Input
                id="bank"
                dir="ltr"
                className={cn('font-mono', vd.invalidClass('bank_account'), textRo('text-start').className)}
                aria-invalid={vd.ariaInvalid('bank_account')}
                readOnly={textRo().readOnly}
                disabled={textRo().disabled}
                tabIndex={textRo().tabIndex}
                {...form.register('bank_account')}
              />
            </div>
            {formError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            </fieldset>
          </form>
        </SectionCard>

        {!isNew && !Number.isNaN(eid) ? (
          <SectionCard title={t('employees.form.schedule')}>
            <p className="text-sm text-muted-foreground">{t('employees.form.schedule_hint')}</p>
            <ul className="list-inside list-disc text-sm">
              {sched.map((s) => (
                <li key={s.id}>
                  {t('employees.form.weekday', { d: s.weekday })} —{' '}
                  {s.is_day_off
                    ? t('employees.form.day_off')
                    : `${s.start_time}–${s.end_time}`}{' '}
                  (branch {s.branch_id})
                </li>
              ))}
              {sched.length === 0 ? <li>—</li> : null}
            </ul>
            <div className="flex flex-wrap gap-2 pt-2">
              {weekdays.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void addDayOff.mutate(d)}
                  disabled={addDayOff.isPending}
                >
                  <Plus className="me-1 size-3" />
                  {t('employees.form.add_day', { d })}
                </Button>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </FormContainer>
  );
}

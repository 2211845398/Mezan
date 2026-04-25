import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
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
import { listBranches, listUsers } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import {
  createEmployee,
  createSchedule,
  updateEmployee,
} from '../../api';
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
  });

type FormValues = z.infer<typeof schema>;

const weekdays = [0, 1, 2, 3, 4, 5, 6] as const;

export default function EmployeeForm() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('hr');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = id === 'new';
  const eid = id && !isNew ? Number(id) : NaN;

  const { data: users = [] } = useQuery({
    queryKey: adminKeys.userList(),
    queryFn: listUsers,
  });
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
    defaultValues: {
      user_id: 0,
      hire_date: '',
      base_salary: '',
      hourly_rate: '',
      bank_account: '',
    },
  });

  useEffect(() => {
    if (!existing) return;
    form.reset({
      user_id: existing.user_id,
      hire_date: existing.hire_date?.slice(0, 10) ?? '',
      base_salary: existing.base_salary != null ? String(existing.base_salary) : '',
      hourly_rate: existing.hourly_rate != null ? String(existing.hourly_rate) : '',
      bank_account: existing.bank_account ?? '',
    });
  }, [existing, form]);

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
          bank_account: v.bank_account?.trim() || null,
        });
      }
      return updateEmployee(eid, {
        hire_date: v.hire_date,
        base_salary: base,
        hourly_rate: hr,
        bank_account: v.bank_account?.trim() || null,
      });
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: hrKeys.root });
      toast.success(t('employees.form.saved'));
      if (isNew) {
        navigate(`/hr/employees/${row.id}/edit`, { replace: true });
      }
    },
    onError: () => toast.error(t('hr_errors.generic')),
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
    },
    onError: () => toast.error(t('hr_errors.generic')),
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{isNew ? t('employees.new') : t('employees.edit')}</h1>
        <Button type="button" variant="outline" asChild>
          <Link to="/hr/employees">{t('employees.title')}</Link>
        </Button>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((v) => save.mutate(v), () =>
          toast.error(t('employees.form.base_or_hourly')),
        )}
      >
        <div className="grid gap-2">
          <Label>{t('employees.form.user')}</Label>
          <Select
            value={form.watch('user_id') ? String(form.watch('user_id')) : ''}
            onValueChange={(v) => form.setValue('user_id', Number(v))}
            disabled={!isNew}
          >
            <SelectTrigger>
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
        </div>
        <div className="grid gap-2">
          <Label>{t('employees.form.hire_date')}</Label>
          <DateField
            value={form.watch('hire_date')}
            onChange={(d) => form.setValue('hire_date', d)}
          />
        </div>
        <div className="grid gap-2">
          <Label>{t('employees.form.base_salary')}</Label>
          <MoneyInput
            value={form.watch('base_salary') ?? ''}
            onChange={(s) => form.setValue('base_salary', s)}
          />
        </div>
        <div className="grid gap-2">
          <Label>{t('employees.form.hourly_rate')}</Label>
          <MoneyInput
            value={form.watch('hourly_rate') ?? ''}
            onChange={(s) => form.setValue('hourly_rate', s)}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('employees.form.rate_hint')}</p>
        <div className="grid gap-2">
          <Label htmlFor="bank">{t('employees.form.bank')}</Label>
          <Input id="bank" {...form.register('bank_account')} />
        </div>
        <Button type="submit" disabled={save.isPending}>
          {t('employees.form.save')}
        </Button>
      </form>

      {!isNew && !Number.isNaN(eid) ? (
        <section className="space-y-2">
          <h2 className="font-medium">{t('employees.form.schedule')}</h2>
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
          <div className="flex flex-wrap gap-2">
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
        </section>
      ) : null}
    </div>
  );
}

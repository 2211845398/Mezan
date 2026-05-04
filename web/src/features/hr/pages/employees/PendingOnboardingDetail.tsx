import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { SectionCard } from '@/components/shared/ContentSurface';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { completeOnboarding, listPendingOnboarding } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import type { UserOnboardingRead } from '@/features/admin/types';

interface ScheduleBlock {
  weekday: number;
  start_time: string;
  end_time: string;
  is_day_off: boolean;
  branch_id: number;
}

const WEEKDAYS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

export default function PendingOnboardingDetail() {
  const { onboardingId } = useParams<{ onboardingId: string }>();
  const id = Number(onboardingId);
  const { t } = useTranslation('hr');
  const { t: tAdmin } = useTranslation('admin');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: pendingList = [], isLoading } = useQuery({
    queryKey: adminKeys.onboardingList(null),
    queryFn: listPendingOnboarding,
  });

  const onboarding = pendingList.find((o: UserOnboardingRead) => o.id === id);

  // Form state
  const [jobTitle, setJobTitle] = useState('');
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [schedules, setSchedules] = useState<ScheduleBlock[]>([]);
  const defaultBranchId = 1;

  const complete = useMutation({
    mutationFn: async () => {
      if (!onboarding) throw new Error('Onboarding not found');

      const hasSalary = salaryAmount.trim();
      const hasHourly = hourlyRate.trim();
      if (!hasSalary && !hasHourly) {
        throw new Error(t('pending.error_salary_or_hourly'));
      }
      if (!contractStart) {
        throw new Error(t('pending.error_contract_start'));
      }

      return completeOnboarding(id, {
        job_title: jobTitle.trim() || null,
        contract_start: contractStart,
        contract_end: contractEnd || null,
        salary_amount: hasSalary ? salaryAmount : null,
        hourly_rate: hasHourly ? hourlyRate : null,
        bank_account: bankAccount.trim() || null,
        notes: notes.trim() || null,
        ...(schedules.length > 0 ? { schedules } : {}),
      });
    },
    onSuccess: () => {
      toast.success(t('pending.completed_success'));
      qc.invalidateQueries({ queryKey: adminKeys.onboardingList(null) });
      qc.invalidateQueries({ queryKey: ['hr'] });
      navigate('/hr/employees');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('hr_errors.generic'));
    },
  });

  const addSchedule = () => {
    setSchedules((prev) => [
      ...prev,
      {
        weekday: prev.length < 7 ? prev.length : 0,
        start_time: '09:00:00',
        end_time: '17:00:00',
        is_day_off: false,
        branch_id: defaultBranchId,
      },
    ]);
  };

  const updateSchedule = (index: number, updates: Partial<ScheduleBlock>) => {
    setSchedules((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s)),
    );
  };

  const removeSchedule = (index: number) => {
    setSchedules((prev) => prev.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <p className="text-muted-foreground">{tAdmin('loading')}</p>
      </div>
    );
  }

  if (!onboarding) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <p className="text-muted-foreground">{t('pending.not_found')}</p>
        <Button asChild>
          <Link to="/hr/employees/pending">{t('actions.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('pending.detail_title')}
        subtitle={t('pending.detail_subtitle', { name: onboarding.user_full_name || onboarding.user_email })}
        actions={
          <BackButton to="/hr/employees/pending" label={t('pending.title')} />
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={t('pending.user_info')}>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{tAdmin('users.col.full_name')}</dt>
              <dd>{onboarding.user_full_name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{tAdmin('users.col.email')}</dt>
              <dd>{onboarding.user_email || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{tAdmin('users.col.role')}</dt>
              <dd>{onboarding.user_role_name || onboarding.user_role_code || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{tAdmin('users.col.branch')}</dt>
              <dd>{onboarding.user_branch_name || '—'}</dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title={t('pending.employment_details')}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              complete.mutate();
            }}
          >
            <div className="space-y-1">
              <Label>{t('employees.form.job_title')}</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t('employees.form.contract_start')}</Label>
                <DateField value={contractStart} onChange={setContractStart} />
              </div>
              <div className="space-y-1">
                <Label>{t('employees.form.contract_end')}</Label>
                <DateField value={contractEnd} onChange={setContractEnd} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t('employees.form.base_salary')}</Label>
                <MoneyInput value={salaryAmount} onChange={setSalaryAmount} />
              </div>
              <div className="space-y-1">
                <Label>{t('employees.form.hourly_rate')}</Label>
                <MoneyInput value={hourlyRate} onChange={setHourlyRate} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('employees.form.rate_hint')}</p>

            <div className="space-y-1">
              <Label>{t('employees.form.bank')}</Label>
              <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>{t('pending.notes')}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                className={floatingFormCloseButtonClassName}
                onClick={() => navigate('/hr/employees/pending')}
                disabled={complete.isPending}
              >
                {tAdmin('actions.cancel')}
              </Button>
              <Button
                type="submit"
                className={floatingFormApproveButtonClassName}
                disabled={complete.isPending}
              >
                {t('pending.complete')}
              </Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title={t('employees.form.schedule')} className="lg:col-span-2">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('pending.schedule_hint')}</p>

            {schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('pending.no_schedules')}</p>
            ) : (
              <div className="space-y-2">
                {schedules.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded border p-2"
                  >
                    <select
                      className="rounded border p-1 text-sm"
                      value={s.weekday}
                      onChange={(e) =>
                        updateSchedule(idx, { weekday: Number(e.target.value) })
                      }
                    >
                      {WEEKDAYS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!s.is_day_off}
                        onCheckedChange={(checked) =>
                          updateSchedule(idx, { is_day_off: !checked })
                        }
                      />
                      <span className="text-sm">
                        {s.is_day_off ? t('employees.form.day_off') : t('employees.form.workday')}
                      </span>
                    </div>

                    {!s.is_day_off && (
                      <>
                        <Input
                          type="time"
                          className="w-24"
                          value={s.start_time.slice(0, 5)}
                          onChange={(e) =>
                            updateSchedule(idx, {
                              start_time: `${e.target.value}:00`,
                            })
                          }
                        />
                        <span>—</span>
                        <Input
                          type="time"
                          className="w-24"
                          value={s.end_time.slice(0, 5)}
                          onChange={(e) =>
                            updateSchedule(idx, {
                              end_time: `${e.target.value}:00`,
                            })
                          }
                        />
                      </>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeSchedule(idx)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" size="sm" variant="outline" onClick={addSchedule}>
              + {t('pending.add_schedule')}
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

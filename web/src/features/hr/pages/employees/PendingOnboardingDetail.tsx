import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/api/errorMessages';
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
import {
  completeOnboarding,
  listPendingOnboarding,
  patchPendingOnboardingSubject,
} from '@/features/admin/api';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { RoleCodeCombobox } from '@/features/admin/components/RoleCodeCombobox';
import { roleCodeLabel } from '@/features/admin/lib/roleLabels';
import { adminKeys } from '@/features/admin/queries';
import type { UserOnboardingRead } from '@/features/admin/types';

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

  const [fullName, setFullName] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!onboarding) return;
    setFullName(onboarding.user_full_name ?? '');
    setRoleCode((onboarding.user_role_code ?? '').trim());
    setBranchId(onboarding.user_branch_id ?? null);
  }, [onboarding]);

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
      const rc = roleCode.trim();
      if (!rc) {
        throw new Error(t('pending.error_role_required'));
      }

      await patchPendingOnboardingSubject(id, {
        full_name: fullName.trim() || null,
        branch_id: branchId,
        role_code: rc,
      });

      const derivedJobTitle = roleCodeLabel(tAdmin, rc, rc) || null;

      return completeOnboarding(id, {
        job_title: derivedJobTitle,
        contract_start: contractStart,
        contract_end: contractEnd || null,
        salary_amount: hasSalary ? salaryAmount : null,
        hourly_rate: hasHourly ? hourlyRate : null,
        bank_account: bankAccount.trim() || null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(t('pending.completed_success'));
      qc.invalidateQueries({ queryKey: adminKeys.onboardingList(null) });
      qc.invalidateQueries({ queryKey: ['hr'] });
      navigate('/hr/employees');
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, t('hr_errors.generic')));
    },
  });

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
          <Link to="/hr/employees/pending">{t('actions.back', { ns: 'common' })}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('pending.detail_title')}
        subtitle={t('pending.detail_subtitle', { name: onboarding.user_full_name || onboarding.user_email })}
        actions={<BackButton to="/hr/employees/pending" label={t('pending.title')} />}
      />

      <SectionCard title={t('pending.primary_card_title')}>
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            complete.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pending-full-name">{tAdmin('users.col.full_name')}</Label>
              <Input
                id="pending-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pending-email">{tAdmin('users.col.email')}</Label>
              <Input id="pending-email" value={onboarding.user_email ?? ''} readOnly className="bg-muted" />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <BranchCombobox
                id="pending-branch"
                label={tAdmin('users.col.branch')}
                value={branchId}
                onChange={setBranchId}
                allowClear
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>{tAdmin('users.col.role')}</Label>
              <RoleCodeCombobox value={roleCode} onChange={setRoleCode} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('pending.email_readonly_hint')}</p>
          <p className="text-xs text-muted-foreground">{t('pending.schedule_after_onboarding')}</p>

          <div className="grid gap-4 border-t pt-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('employees.form.contract_start')}</Label>
              <DateField value={contractStart} onChange={setContractStart} />
            </div>
            <div className="grid gap-2">
              <Label>{t('employees.form.contract_end')}</Label>
              <DateField value={contractEnd} onChange={setContractEnd} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('employees.form.base_salary')}</Label>
              <MoneyInput value={salaryAmount} onChange={setSalaryAmount} />
            </div>
            <div className="grid gap-2">
              <Label>{t('employees.form.hourly_rate')}</Label>
              <MoneyInput value={hourlyRate} onChange={setHourlyRate} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('employees.form.compensation_hint')}</p>

          <div className="grid gap-2">
            <Label>{t('employees.form.bank')}</Label>
            <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>{t('pending.notes')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              className={floatingFormCloseButtonClassName}
              onClick={() => navigate('/hr/employees/pending')}
              disabled={complete.isPending}
            >
              {tAdmin('actions.cancel')}
            </Button>
            <Button type="submit" className={floatingFormApproveButtonClassName} disabled={complete.isPending}>
              {t('pending.complete')}
            </Button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

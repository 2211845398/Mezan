import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  completeOnboarding,
  listPendingOnboarding,
  patchPendingOnboardingSubject,
  uploadOnboardingIdentityDocumentImage,
} from '@/features/admin/api';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { RoleCodeCombobox } from '@/features/admin/components/RoleCodeCombobox';
import { roleCodeLabel } from '@/features/admin/lib/roleLabels';
import { adminKeys } from '@/features/admin/queries';
import type { UserOnboardingRead } from '@/features/admin/types';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { formatPersonName } from '@/lib/personName';

export default function PendingOnboardingDetail() {
  const { onboardingId } = useParams<{ onboardingId: string }>();
  const id = Number(onboardingId);
  const { t, i18n } = useTranslation('hr');
  const { t: tAdmin } = useTranslation('admin');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: pendingList = [], isLoading } = useQuery({
    queryKey: adminKeys.onboardingList(null),
    queryFn: listPendingOnboarding,
  });

  const onboarding = pendingList.find((o: UserOnboardingRead) => o.id === id);

  const [firstName, setFirstName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [idDocType, setIdDocType] = useState('');
  const [idDocNumber, setIdDocNumber] = useState('');
  const [idImageUrl, setIdImageUrl] = useState<string | null>(null);
  const idFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!onboarding) return;
    setFirstName(onboarding.user_first_name ?? '');
    setFatherName(onboarding.user_father_name ?? '');
    setFamilyName(onboarding.user_family_name ?? '');
    setRoleCode((onboarding.user_role_code ?? '').trim());
    setBranchId(onboarding.user_branch_id ?? null);
    setIdDocType(onboarding.identity_document_type ?? '');
    setIdDocNumber(onboarding.identity_document_number ?? '');
    setIdImageUrl(onboarding.identity_document_image_url ?? null);
  }, [onboarding]);

  const uploadIdScan = useMutation({
    mutationFn: (file: File) => uploadOnboardingIdentityDocumentImage(id, file),
    onSuccess: (res) => {
      setIdImageUrl(res.image_url);
      void qc.invalidateQueries({ queryKey: adminKeys.onboardingList(null) });
      toast.success(t('pending.identity_scan_uploaded'));
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, t('hr_errors.generic')));
    },
  });

  useEffect(() => {
    const s = contractStart.trim();
    const e = contractEnd.trim();
    if (!s || !e) return;
    if (e < s) {
      setContractEnd('');
    }
  }, [contractStart, contractEnd]);

  const complete = useMutation({
    mutationFn: async () => {
      if (!onboarding) throw new Error('Onboarding not found');

      const hasSalary = salaryAmount.trim();
      const hasHourly = hourlyRate.trim();
      if (!hasSalary && !hasHourly) {
        throw new Error(t('pending.error_salary_or_hourly'));
      }
      if (!contractStart.trim()) {
        throw new Error(t('pending.error_contract_start'));
      }
      if (contractEnd.trim() && contractEnd.trim() < contractStart.trim()) {
        throw new Error(t('pending.error_contract_end_before_start'));
      }
      const rc = roleCode.trim();
      if (!rc) {
        throw new Error(t('pending.error_role_required'));
      }

      await patchPendingOnboardingSubject(id, {
        first_name: firstName.trim() || null,
        father_name: fatherName.trim() || null,
        family_name: familyName.trim() || null,
        branch_id: branchId,
        role_code: rc,
      });

      const derivedJobTitle = roleCodeLabel(tAdmin, rc, rc) || null;

      return completeOnboarding(id, {
        job_title: derivedJobTitle,
        contract_start: contractStart.trim(),
        contract_end: contractEnd.trim() || null,
        salary_amount: hasSalary ? salaryAmount : null,
        hourly_rate: hasHourly ? hourlyRate : null,
        bank_account: bankAccount.trim() || null,
        notes: notes.trim() || null,
        identity_document_type: idDocType.trim() || null,
        identity_document_number: idDocNumber.trim() || null,
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
        subtitle={t('pending.detail_subtitle', {
          name:
            formatPersonName(onboarding.user_first_name, onboarding.user_father_name, onboarding.user_family_name) ||
            onboarding.user_full_name ||
            onboarding.user_email,
        })}
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
              <Label htmlFor="pending-fn">{tAdmin('users.col.first_name')}</Label>
              <Input id="pending-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pending-father">{tAdmin('users.col.father_name')}</Label>
              <Input
                id="pending-father"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                autoComplete="additional-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pending-family">{tAdmin('users.col.family_name')}</Label>
              <Input id="pending-family" value={familyName} onChange={(e) => setFamilyName(e.target.value)} autoComplete="family-name" />
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

          <div className="grid gap-4 border-t pt-6 sm:grid-cols-2">
            <div className="grid gap-2" dir={i18n.dir()}>
              <Label>{t('employees.form.identity_document_type')}</Label>
              <Select
                value={idDocType || '__none__'}
                onValueChange={(v) => setIdDocType(v === '__none__' ? '' : v)}
                disabled={uploadIdScan.isPending}
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
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pending-id-doc-number">{t('employees.form.identity_document_number')}</Label>
              <Input
                id="pending-id-doc-number"
                value={idDocNumber}
                onChange={(e) => setIdDocNumber(e.target.value)}
                autoComplete="off"
                disabled={uploadIdScan.isPending}
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
                  if (f) uploadIdScan.mutate(f);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploadIdScan.isPending || complete.isPending}
                  onClick={() => idFileInputRef.current?.click()}
                >
                  {t('employees.form.identity_document_choose')}
                </Button>
                {uploadIdScan.isPending ? (
                  <span className="text-sm text-muted-foreground">{tAdmin('loading')}</span>
                ) : null}
              </div>
              {idImageUrl ? (
                <div className="mt-2 grid gap-2">
                  <p className="text-xs text-muted-foreground">{t('employees.form.identity_document_preview')}</p>
                  <a href={resolveMediaUrl(idImageUrl)} target="_blank" rel="noreferrer" className="inline-block max-w-xs">
                    <img
                      src={resolveMediaUrl(idImageUrl)}
                      alt=""
                      className="max-h-40 rounded-md border object-contain"
                    />
                  </a>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 border-t pt-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('employees.form.contract_start')}</Label>
              <DateField value={contractStart} onChange={setContractStart} />
            </div>
            <div className="grid gap-2">
              <Label>{t('employees.form.contract_end')}</Label>
              <DateField
                value={contractEnd}
                onChange={setContractEnd}
                minSelectableDate={contractStart.trim() || undefined}
              />
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

          <div className="grid gap-2">
            <Label>{t('employees.form.bank')}</Label>
            <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>{t('pending.notes')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex flex-wrap justify-end gap-[5px] border-t pt-4">
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

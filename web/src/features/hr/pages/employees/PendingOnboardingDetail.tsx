import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getLocalizedApiErrorMessage } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { DateField } from '@/components/shared/form/DateField';
import { useDateRangeConstraint } from '@/hooks/useDateRangeConstraint';
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
import { digitsOnlyNationalId, isValidLibyanNationalId } from '@/features/hr/lib/libyanNationalId';
import { isValidLibyanIban, normalizeLibyanIban } from '@/features/hr/lib/libyanIban';
import { focusElementById, invalidFieldClass } from '@/lib/formValidation';
import type { FieldErrors, FieldValues } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { formatPersonName } from '@/lib/personName';

type PendingFieldKey =
  | 'role_code'
  | 'contract_start'
  | 'contract_end'
  | 'hourly_rate'
  | 'salary_amount'
  | 'bank_account'
  | 'identity_document_number';

const PENDING_VALIDATION_ORDER: { field: PendingFieldKey; focusId: string }[] = [
  { field: 'role_code', focusId: 'pending-role' },
  { field: 'contract_start', focusId: 'pending-contract-start' },
  { field: 'contract_end', focusId: 'pending-contract-end' },
  { field: 'hourly_rate', focusId: 'pending-hourly-rate' },
  { field: 'salary_amount', focusId: 'pending-salary' },
  { field: 'bank_account', focusId: 'pending-bank' },
  { field: 'identity_document_number', focusId: 'pending-id-doc-number' },
];

export default function PendingOnboardingDetail() {
  const { onboardingId } = useParams<{ onboardingId: string }>();
  const id = Number(onboardingId);
  const { t, i18n } = useTranslation('hr');
  const { t: tc } = useTranslation('common');
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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PendingFieldKey, string>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const idFileInputRef = useRef<HTMLInputElement>(null);

  function pendingErrorsForClass(): Record<string, { message: string }> {
    const out: Record<string, { message: string }> = {};
    for (const [k, v] of Object.entries(fieldErrors)) {
      if (v) out[k] = { message: v };
    }
    return out;
  }

  const pendingFieldErrors = pendingErrorsForClass();

  const clearFieldError = (key: PendingFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

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
      toast.error(getLocalizedApiErrorMessage(err, tc, t('hr_errors.generic')));
    },
  });

  const { minToDate: minContractEndDate } = useDateRangeConstraint(
    contractStart,
    contractEnd,
    setContractEnd,
  );

  function validatePendingForm(): Partial<Record<PendingFieldKey, string>> {
    const next: Partial<Record<PendingFieldKey, string>> = {};
    const hasSalary = salaryAmount.trim();
    const hasHourly = hourlyRate.trim();
    if (!hasSalary && !hasHourly) {
      next.hourly_rate = t('pending.error_salary_or_hourly');
    }
    if (!contractStart.trim()) {
      next.contract_start = t('pending.error_contract_start');
    }
    if (contractEnd.trim() && contractEnd.trim() < contractStart.trim()) {
      next.contract_end = t('pending.error_contract_end_before_start');
    }
    if (!roleCode.trim()) {
      next.role_code = t('pending.error_role_required');
    }
    const docType = idDocType.trim();
    const docDigits =
      docType === 'national_id' ? digitsOnlyNationalId(idDocNumber) : idDocNumber.trim();
    if (docType === 'national_id' && docDigits && !isValidLibyanNationalId(docDigits)) {
      next.identity_document_number = t('employees.form.national_id_invalid');
    }
    const bank = bankAccount.trim();
    if (bank && !isValidLibyanIban(bank)) {
      next.bank_account = t('employees.form.iban_invalid');
    }
    return next;
  }

  const complete = useMutation({
    mutationFn: async () => {
      if (!onboarding) throw new Error('Onboarding not found');

      const hasSalary = salaryAmount.trim();
      const hasHourly = hourlyRate.trim();
      const rc = roleCode.trim();
      const docType = idDocType.trim();
      const docDigits =
        docType === 'national_id' ? digitsOnlyNationalId(idDocNumber) : idDocNumber.trim();
      const bank = bankAccount.trim();

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
        bank_account: bank ? normalizeLibyanIban(bank) : null,
        notes: notes.trim() || null,
        identity_document_type: docType || null,
        identity_document_number: docDigits || null,
      });
    },
    onSuccess: () => {
      toast.success(t('pending.completed_success'));
      qc.invalidateQueries({ queryKey: adminKeys.onboardingList(null) });
      qc.invalidateQueries({ queryKey: ['hr'] });
      navigate('/hr/employees');
    },
    onError: (err) => {
      toast.error(getLocalizedApiErrorMessage(err, tc, t('hr_errors.generic')));
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
            const nextErrors = validatePendingForm();
            if (Object.keys(nextErrors).length > 0) {
              setSubmitAttempted(true);
              setFieldErrors(nextErrors);
              const first = PENDING_VALIDATION_ORDER.find((o) => nextErrors[o.field]);
              const firstMsg = first ? nextErrors[first.field] : Object.values(nextErrors)[0];
              if (firstMsg) toast.error(firstMsg);
              if (first) focusElementById(first.focusId);
              return;
            }
            setFieldErrors({});
            setSubmitAttempted(false);
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
            <div id="pending-role" className="grid gap-2 sm:col-span-2">
              <Label>{tAdmin('users.col.role')}</Label>
              <RoleCodeCombobox
                value={roleCode}
                onChange={(v) => {
                  setRoleCode(v);
                  clearFieldError('role_code');
                }}
                invalid={!!fieldErrors.role_code}
              />
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
                inputMode={idDocType === 'national_id' ? 'numeric' : 'text'}
                maxLength={idDocType === 'national_id' ? 12 : 128}
                value={idDocNumber}
                onChange={(e) => {
                  clearFieldError('identity_document_number');
                  setIdDocNumber(
                    idDocType === 'national_id'
                      ? digitsOnlyNationalId(e.target.value)
                      : e.target.value,
                  );
                }}
                autoComplete="off"
                disabled={uploadIdScan.isPending}
                className={invalidFieldClass(
                  pendingFieldErrors as FieldErrors<FieldValues>,
                  'identity_document_number',
                  submitAttempted,
                )}
                aria-invalid={fieldErrors.identity_document_number ? true : undefined}
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
              <Label htmlFor="pending-contract-start">{t('employees.form.contract_start')}</Label>
              <DateField
                id="pending-contract-start"
                name="contract_start"
                value={contractStart}
                onChange={(v) => {
                  setContractStart(v);
                  clearFieldError('contract_start');
                }}
                invalid={!!fieldErrors.contract_start}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pending-contract-end">{t('employees.form.contract_end')}</Label>
              <DateField
                id="pending-contract-end"
                name="contract_end"
                value={contractEnd}
                onChange={(v) => {
                  setContractEnd(v);
                  clearFieldError('contract_end');
                }}
                invalid={!!fieldErrors.contract_end}
                minSelectableDate={minContractEndDate}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div id="pending-salary" className="grid gap-2">
              <Label htmlFor="pending-salary-input">{t('employees.form.base_salary')}</Label>
              <MoneyInput
                id="pending-salary-input"
                name="salary_amount"
                value={salaryAmount}
                onChange={(v) => {
                  setSalaryAmount(v);
                  clearFieldError('salary_amount');
                  clearFieldError('hourly_rate');
                }}
                invalid={!!fieldErrors.salary_amount}
              />
            </div>
            <div id="pending-hourly-rate" className="grid gap-2">
              <Label htmlFor="pending-hourly-input">{t('employees.form.hourly_rate')}</Label>
              <MoneyInput
                id="pending-hourly-input"
                name="hourly_rate"
                value={hourlyRate}
                onChange={(v) => {
                  setHourlyRate(v);
                  clearFieldError('hourly_rate');
                  clearFieldError('salary_amount');
                }}
                invalid={!!fieldErrors.hourly_rate}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pending-bank">{t('employees.form.bank')}</Label>
            <Input
              id="pending-bank"
              dir="ltr"
              className={cn(
                'font-mono text-start',
                invalidFieldClass(
                  pendingFieldErrors as FieldErrors<FieldValues>,
                  'bank_account',
                  submitAttempted,
                ),
              )}
              value={bankAccount}
              onChange={(e) => {
                setBankAccount(e.target.value);
                clearFieldError('bank_account');
              }}
              aria-invalid={fieldErrors.bank_account ? true : undefined}
            />
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

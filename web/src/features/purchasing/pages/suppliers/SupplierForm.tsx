import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { ReadOnlyCopyableField } from '@/components/shared/form/ReadOnlyCopyableField';
import { SectionCard } from '@/components/shared/ContentSurface';
import { handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import {
  createFormInvalidHandler,
  useFormValidationDisplay,
} from '@/lib/formValidation';
import {
  readOnlyTextInputProps,
} from '@/lib/readOnlyFieldStyles';
import { useEditableFormMode } from '@/lib/useEditableFormMode';
import { Button } from '@/components/ui/button';
import { FormValidationAlert } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import CurrencySelect from '@/features/accounting/components/CurrencySelect';
import {
  filterPayableSupplierAccounts,
  formatPayableAccountOptionLabel,
} from '@/features/accounting/lib/payableAccountOptions';
import {
  accountingSettingsQueryOptions,
  chartAccountsQueryOptions,
  currenciesQueryOptions,
  paymentTermsQueryOptions,
} from '@/features/accounting/queries';
import { zodLibyanPhoneOptional, normalizeLyPhoneInput } from '@/lib/validation/contact';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';

import { createSupplier, updateSupplier } from '../../api';
import { purchasingKeys, supplierQueryOptions } from '../../queries';

function supplierFormSchema(tc: TFunction<'common'>) {
  return z.object({
    first_name: z.string().min(1).max(255),
    father_name: z.string().max(255),
    family_name: z.string().max(255),
    currency_code: z.string().min(3).max(3),
    payables_account_id: z.string().optional(),
    tax_id: z.string().max(64).optional().nullable(),
    payment_terms_id: z.string().optional(),
    contact_phone: zodLibyanPhoneOptional(tc('errors.validation_phone_ly')),
    contact_email: z
      .string()
      .min(1, tc('errors.validation_email'))
      .email(tc('errors.validation_email_invalid')),
  });
}

export type SupplierFormValues = z.infer<ReturnType<typeof supplierFormSchema>>;

const SUPPLIER_FORM_FIELD_ORDER = [
  'first_name',
  'father_name',
  'family_name',
  'currency_code',
  'tax_id',
  'payment_terms_id',
  'contact_phone',
  'contact_email',
  'payables_account_id',
] as const;

export const SUPPLIER_DIALOG_FORM_ID = 'purchasing-supplier-dialog-form';
export const SUPPLIER_PAGE_FORM_ID = 'purchasing-supplier-page-form';

export type SupplierFormProps = {
  variant?: 'page' | 'dialog';
  /** Hide page header when rendered inside SupplierDetailLayout tabs. */
  embedded?: boolean;
  onDismiss?: () => void;
  /** When passed in dialog mode, this ID is used instead of URL param for editing. */
  editId?: number;
};

export default function SupplierForm({
  variant = 'page',
  embedded = false,
  onDismiss,
  editId,
}: SupplierFormProps = {}) {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('purchasing');
  const { t: tAccounting } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const isAr = i18n.language.startsWith('ar');
  const canUpdate = usePermission('suppliers', 'update');
  const pathnameIsNew = /\/purchasing\/suppliers\/new\/?$/.test(location.pathname);
  const isNew = variant === 'dialog' ? editId == null : pathnameIsNew || id === 'new';
  const supplierId = editId != null ? editId : (!isNew && id ? Number(id) : NaN);

  const { data: existing } = useQuery({
    ...supplierQueryOptions(supplierId),
    enabled: !isNew && !Number.isNaN(supplierId),
  });

  const { data: accounts = [] } = useQuery(chartAccountsQueryOptions());
  const payableAccounts = useMemo(() => filterPayableSupplierAccounts(accounts), [accounts]);
  const { data: paymentTerms = [] } = useQuery(paymentTermsQueryOptions(true));
  const { data: currencies = [] } = useQuery(currenciesQueryOptions(false));
  const { data: settings } = useQuery(accountingSettingsQueryOptions());

  const defaultCurrency = settings?.base_currency_code ?? 'USD';

  const schema = useMemo(() => supplierFormSchema(tc), [tc]);

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      first_name: '',
      father_name: '',
      family_name: '',
      currency_code: defaultCurrency,
      payables_account_id: '',
      tax_id: '',
      payment_terms_id: '',
      contact_phone: '',
      contact_email: '',
    },
  });

  const vd = useFormValidationDisplay(form.control);
  const editMode = useEditableFormMode({
    form,
    canEdit: canUpdate,
    isCreate: isNew,
  });
  const fieldsEnabled = variant === 'dialog' ? true : editMode.fieldsEnabled;
  const textRo = (extraClass?: string) => readOnlyTextInputProps(fieldsEnabled, extraClass);

  const currencyCode = form.watch('currency_code');
  const paymentTermsId = form.watch('payment_terms_id');
  const payablesAccountId = form.watch('payables_account_id');

  const currencyDisplayLabel = useMemo(() => {
    const c = currencies.find((row) => row.code === currencyCode);
    if (!c) return currencyCode || '—';
    return `${c.code} — ${c.name}${c.is_base ? ` (${tAccounting('currencies.base_badge')})` : ''}`;
  }, [currencies, currencyCode, tAccounting]);

  const paymentTermsDisplayLabel = useMemo(() => {
    if (!paymentTermsId) return '—';
    const pt = paymentTerms.find((row) => String(row.id) === paymentTermsId);
    if (!pt) return '—';
    return `${isAr ? pt.name_ar : pt.name_en} (${pt.days})`;
  }, [isAr, paymentTerms, paymentTermsId]);

  const payablesDisplayLabel = useMemo(() => {
    if (!payablesAccountId) return '—';
    const account = payableAccounts.find((row) => String(row.id) === payablesAccountId);
    if (!account) return '—';
    return formatPayableAccountOptionLabel(account, i18n.language);
  }, [payableAccounts, payablesAccountId, i18n.language]);
  useEffect(() => {
    if (settings?.base_currency_code && isNew && !form.formState.isDirty) {
      form.setValue('currency_code', settings.base_currency_code);
    }
  }, [settings?.base_currency_code, isNew, form]);

  useEffect(() => {
    if (!existing) {
      return;
    }
    const c = existing.contact as Record<string, string | undefined> | undefined;
    let payablesId =
      existing.payables_account_id != null ? String(existing.payables_account_id) : '';
    if (payablesId && !payableAccounts.some((a) => String(a.id) === payablesId)) {
      payablesId = '';
    }
    form.reset({
      first_name: existing.first_name ?? '',
      father_name: existing.father_name ?? '',
      family_name: existing.family_name ?? '',
      currency_code: existing.currency_code ?? defaultCurrency,
      payables_account_id: payablesId,
      tax_id: existing.tax_id ?? '',
      payment_terms_id:
        existing.payment_terms_id != null ? String(existing.payment_terms_id) : '',
      contact_phone: c?.phone ?? '',
      contact_email: c?.email ?? '',
    });
    if (variant === 'page' && !isNew) {
      editMode.syncSnapshot();
    }
  }, [existing, form, defaultCurrency, payableAccounts, variant, isNew, editMode.syncSnapshot]);

  const save = useMutation({
    mutationFn: async (values: SupplierFormValues) => {
      const contact: Record<string, string> = {};
      const p = values.contact_phone.trim();
      if (p) contact.phone = normalizeLyPhoneInput(p);
      const em = values.contact_email.trim();
      if (em) contact.email = em;
      const payRaw = values.payables_account_id?.trim();
      const pay = payRaw ? Number(payRaw) : null;
      const ptRaw = values.payment_terms_id?.trim();
      const payment_terms_id = ptRaw ? Number(ptRaw) : null;
      const payload = {
        first_name: values.first_name.trim(),
        father_name: values.father_name.trim() || null,
        family_name: values.family_name.trim() || null,
        currency_code: values.currency_code.trim().toUpperCase(),
        payables_account_id: pay,
        tax_id: values.tax_id || null,
        payment_terms_id,
        contact,
      };
      if (isNew) {
        return createSupplier(payload);
      }
      return updateSupplier(supplierId, payload);
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: purchasingKeys.suppliers() });
      toast.success(t('suppliers.form.created'));
      if (variant === 'dialog') {
        onDismiss?.();
        return;
      }
      if (isNew) {
        navigate(`/purchasing/suppliers/${row.id}/data`, { replace: true });
      } else if (variant === 'page') {
        editMode.finishEdit();
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const onInvalid = createFormInvalidHandler(form, {
    fieldOrder: [...SUPPLIER_FORM_FIELD_ORDER],
  });

  const useSectionLayout = embedded;

  const nameFields = (
    <div dir={i18n.dir()} className="contents">
      <div className="grid gap-2">
        <Label htmlFor="sup-fn">{t('suppliers.form.first_name')}</Label>
        <Input
          id="sup-fn"
          className={cn(vd.invalidClass('first_name'), textRo().className)}
          aria-invalid={vd.ariaInvalid('first_name')}
          readOnly={textRo().readOnly}
          disabled={textRo().disabled}
          tabIndex={textRo().tabIndex}
          {...form.register('first_name')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sup-father">{t('suppliers.form.father_name')}</Label>
        <Input
          id="sup-father"
          readOnly={textRo().readOnly}
          disabled={textRo().disabled}
          tabIndex={textRo().tabIndex}
          className={textRo().className}
          {...form.register('father_name')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sup-family">{t('suppliers.form.family_name')}</Label>
        <Input
          id="sup-family"
          readOnly={textRo().readOnly}
          disabled={textRo().disabled}
          tabIndex={textRo().tabIndex}
          className={textRo().className}
          {...form.register('family_name')}
        />
      </div>
    </div>
  );

  const financialFields = (
    <div dir={i18n.dir()} className="contents">
      <div className="grid gap-2">
        <Label htmlFor="currency_code">{t('suppliers.form.currency_code')}</Label>
        {fieldsEnabled ? (
          <CurrencySelect
            value={currencyCode}
            onValueChange={(v) =>
              form.setValue('currency_code', v, { shouldDirty: true, shouldValidate: true })
            }
            dir={i18n.dir()}
          />
        ) : (
          <ReadOnlyCopyableField
            id="currency_code"
            value={currencyDisplayLabel}
            dir={i18n.dir()}
          />
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tax_id">{t('suppliers.form.tax_id')}</Label>
        <Input
          id="tax_id"
          readOnly={textRo().readOnly}
          disabled={textRo().disabled}
          tabIndex={textRo().tabIndex}
          className={textRo().className}
          {...form.register('tax_id')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="payment_terms_id">{t('suppliers.form.payment_terms')}</Label>
        {fieldsEnabled ? (
          <Select
            value={paymentTermsId || '__none'}
            onValueChange={(v) =>
              form.setValue('payment_terms_id', v === '__none' ? '' : v, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent dir={i18n.dir()} align={isAr ? 'end' : 'start'}>
              <SelectItem value="__none">—</SelectItem>
              {paymentTerms.map((pt) => (
                <SelectItem key={pt.id} value={String(pt.id)}>
                  {isAr ? pt.name_ar : pt.name_en} ({pt.days})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <ReadOnlyCopyableField
            id="payment_terms_id"
            value={paymentTermsDisplayLabel}
            dir={i18n.dir()}
          />
        )}
      </div>
    </div>
  );

  const contactFields = (
    <div dir={i18n.dir()} className="contents">
      <div className="grid gap-2">
        <Label htmlFor="contact_phone">{t('suppliers.form.contact_phone')}</Label>
        <Input
          id="contact_phone"
          dir="ltr"
          className={cn('num-latin', vd.invalidClass('contact_phone'), textRo().className)}
          aria-invalid={vd.ariaInvalid('contact_phone')}
          readOnly={textRo().readOnly}
          disabled={textRo().disabled}
          tabIndex={textRo().tabIndex}
          {...form.register('contact_phone')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="contact_email">{t('suppliers.form.contact_email')}</Label>
        <Input
          id="contact_email"
          type="email"
          dir="ltr"
          className={cn('num-latin', vd.invalidClass('contact_email'), textRo().className)}
          aria-invalid={vd.ariaInvalid('contact_email')}
          readOnly={textRo().readOnly}
          disabled={textRo().disabled}
          tabIndex={textRo().tabIndex}
          {...form.register('contact_email')}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="payables_account_id">{t('suppliers.form.payables_account_id')}</Label>
        {fieldsEnabled ? (
          <Select
            value={payablesAccountId || '__none'}
            onValueChange={(v) =>
              form.setValue('payables_account_id', v === '__none' ? '' : v, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger id="payables_account_id">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent dir={i18n.dir()} align={isAr ? 'end' : 'start'}>
              <SelectItem value="__none">—</SelectItem>
              {payableAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {formatPayableAccountOptionLabel(a, i18n.language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <ReadOnlyCopyableField
            id="payables_account_id"
            value={payablesDisplayLabel}
            dir={i18n.dir()}
          />
        )}
      </div>
    </div>
  );

  const pageActionBar =
    variant === 'page' ? (
      <DetailFormActionBar
        isEditing={editMode.isEditing}
        isCreate={isNew}
        canEdit={canUpdate}
        isSubmitting={save.isPending}
        formId={SUPPLIER_PAGE_FORM_ID}
        onStartEdit={editMode.startEdit}
        onCancelEdit={editMode.cancelEdit}
      />
    ) : null;

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4',
        embedded ? 'max-w-none' : 'mx-auto max-w-lg',
        variant === 'page' && !embedded ? 'p-4' : '',
      )}
    >
      {variant === 'page' && !embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{isNew ? t('suppliers.new') : t('suppliers.edit')}</h1>
          {!isNew && existing?.code ? (
            <span className="text-sm text-muted-foreground">
              {t('suppliers.form.code_display')}: {existing.code}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-[5px]">
            <Button type="button" variant="outline" asChild>
              <Link to="/purchasing/suppliers">{t('suppliers.title')}</Link>
            </Button>
            {pageActionBar}
          </div>
        </div>
      ) : null}
      {variant === 'page' && embedded ? pageActionBar : null}
      {embedded && !isNew && existing?.code ? (
        <p className="text-sm text-muted-foreground">
          {t('suppliers.form.code_display')}: {existing.code}
        </p>
      ) : null}
      <FormProvider {...form}>
      <form
        id={variant === 'dialog' ? SUPPLIER_DIALOG_FORM_ID : SUPPLIER_PAGE_FORM_ID}
        className={cn('flex flex-col', useSectionLayout ? 'gap-6' : 'gap-3')}
        onKeyDown={handleFormEnterSubmit}
        onSubmit={form.handleSubmit((v) => save.mutate(v), onInvalid)}
        noValidate
        dir={i18n.dir()}
      >
        <fieldset disabled={save.isPending} className="contents">
        {useSectionLayout ? (
          <>
            <SectionCard {...(embedded ? {} : { title: t('suppliers.tabs.data') })}>
              <div className="grid gap-4 sm:grid-cols-2" dir={i18n.dir()}>
                {nameFields}
                {financialFields}
              </div>
            </SectionCard>
            <SectionCard title={t('suppliers.form.contact_section')}>
              <div className="grid gap-4 sm:grid-cols-2" dir={i18n.dir()}>{contactFields}</div>
            </SectionCard>
          </>
        ) : (
          <>
            {nameFields}
            {financialFields}
            {contactFields}
          </>
        )}
        <FormValidationAlert />
        </fieldset>
      </form>
      </FormProvider>
    </div>
  );
}

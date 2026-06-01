import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import {
  focusFirstFormError,
  useFormValidationDisplay,
} from '@/lib/formValidation';
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
import CurrencySelect from '@/features/accounting/components/CurrencySelect';
import {
  filterPayableSupplierAccounts,
  formatPayableAccountOptionLabel,
} from '@/features/accounting/lib/payableAccountOptions';
import {
  accountingSettingsQueryOptions,
  chartAccountsQueryOptions,
  paymentTermsQueryOptions,
} from '@/features/accounting/queries';
import { zodLibyanPhoneOptional, zodOptionalNonEmptyEmail, normalizeLyPhoneInput } from '@/lib/validation/contact';
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
    contact_email: zodOptionalNonEmptyEmail(tc('errors.validation_email')),
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
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const isAr = i18n.language.startsWith('ar');
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
  }, [existing, form, defaultCurrency, payableAccounts]);

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
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const onInvalid = (errs: FieldErrors<SupplierFormValues>) => {
    toast.error(t('suppliers.form.validation_summary'));
    focusFirstFormError(form, errs, SUPPLIER_FORM_FIELD_ORDER);
  };

  const useSectionLayout = embedded;

  const nameFields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="sup-fn">{t('suppliers.form.first_name')}</Label>
        <Input
          id="sup-fn"
          className={vd.invalidClass('first_name')}
          aria-invalid={vd.ariaInvalid('first_name')}
          {...form.register('first_name')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sup-father">{t('suppliers.form.father_name')}</Label>
        <Input id="sup-father" {...form.register('father_name')} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sup-family">{t('suppliers.form.family_name')}</Label>
        <Input id="sup-family" {...form.register('family_name')} />
      </div>
    </>
  );

  const financialFields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="currency_code">{t('suppliers.form.currency_code')}</Label>
        <CurrencySelect
          value={form.watch('currency_code')}
          onValueChange={(v) =>
            form.setValue('currency_code', v, { shouldDirty: true, shouldValidate: true })
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tax_id">{t('suppliers.form.tax_id')}</Label>
        <Input id="tax_id" {...form.register('tax_id')} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="payment_terms_id">{t('suppliers.form.payment_terms')}</Label>
        <Select
          value={form.watch('payment_terms_id') || '__none'}
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
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {paymentTerms.map((pt) => (
              <SelectItem key={pt.id} value={String(pt.id)}>
                {isAr ? pt.name_ar : pt.name_en} ({pt.days})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const contactFields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="contact_phone">{t('suppliers.form.contact_phone')}</Label>
        <Input
          id="contact_phone"
          className={vd.invalidClass('contact_phone')}
          aria-invalid={vd.ariaInvalid('contact_phone')}
          {...form.register('contact_phone')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="contact_email">{t('suppliers.form.contact_email')}</Label>
        <Input
          id="contact_email"
          type="email"
          className={vd.invalidClass('contact_email')}
          aria-invalid={vd.ariaInvalid('contact_email')}
          {...form.register('contact_email')}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2" dir={i18n.dir()}>
        <Label htmlFor="payables_account_id">{t('suppliers.form.payables_account_id')}</Label>
        <Select
          value={form.watch('payables_account_id') || '__none'}
          onValueChange={(v) =>
            form.setValue('payables_account_id', v === '__none' ? '' : v, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger
            id="payables_account_id"
            className={cn(
              isAr && 'flex-row-reverse text-end [&>span]:w-full [&>span]:text-end',
            )}
          >
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent dir={i18n.dir()} align={isAr ? 'end' : 'start'}>
            <SelectItem value="__none" className={cn(isAr && 'text-end')}>
              —
            </SelectItem>
            {payableAccounts.map((a) => (
              <SelectItem
                key={a.id}
                value={String(a.id)}
                className={cn(isAr && 'text-end')}
              >
                {formatPayableAccountOptionLabel(a, i18n.language)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const saveActions = (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={save.isPending}>
        {t('suppliers.form.save')}
      </Button>
      {variant === 'dialog' && onDismiss ? (
        <Button type="button" variant="ghost" onClick={onDismiss} disabled={save.isPending}>
          {t('actions.cancel', { ns: 'common' })}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4',
        embedded ? 'max-w-none' : 'mx-auto max-w-lg',
        variant === 'page' && !embedded ? 'p-4' : '',
      )}
    >
      {variant === 'page' && !embedded ? (
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{isNew ? t('suppliers.new') : t('suppliers.edit')}</h1>
          {!isNew && existing?.code ? (
            <span className="text-sm text-muted-foreground">
              {t('suppliers.form.code_display')}: {existing.code}
            </span>
          ) : null}
          <Button type="button" variant="outline" asChild>
            <Link to="/purchasing/suppliers">{t('suppliers.title')}</Link>
          </Button>
        </div>
      ) : null}
      {embedded && !isNew && existing?.code ? (
        <p className="text-sm text-muted-foreground">
          {t('suppliers.form.code_display')}: {existing.code}
        </p>
      ) : null}
      <form
        className={cn('flex flex-col', useSectionLayout ? 'gap-6' : 'gap-3')}
        onKeyDown={handleFormEnterSubmit}
        onSubmit={form.handleSubmit((v) => save.mutate(v), onInvalid)}
        noValidate
      >
        {useSectionLayout ? (
          <>
            <SectionCard title={embedded ? t('suppliers.tabs.data') : undefined}>
              <div className="grid gap-4 sm:grid-cols-2">
                {nameFields}
                {financialFields}
              </div>
            </SectionCard>
            <SectionCard title={t('suppliers.form.contact_section')}>
              <div className="grid gap-4 sm:grid-cols-2">{contactFields}</div>
            </SectionCard>
            {saveActions}
          </>
        ) : (
          <>
            {nameFields}
            {financialFields}
            {contactFields}
            {saveActions}
          </>
        )}
      </form>
    </div>
  );
}

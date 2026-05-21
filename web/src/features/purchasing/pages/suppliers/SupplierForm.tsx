import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
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
import { filterPayableSupplierAccounts } from '@/features/accounting/lib/payableAccountOptions';
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

export type SupplierFormProps = {
  variant?: 'page' | 'dialog';
  onDismiss?: () => void;
  /** When passed in dialog mode, this ID is used instead of URL param for editing. */
  editId?: number;
};

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

export default function SupplierForm({ variant = 'page', onDismiss, editId }: SupplierFormProps = {}) {
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

  const errors = form.formState.errors;

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
        navigate(`/purchasing/suppliers/${row.id}/edit`, { replace: true });
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const onInvalid = () => {
    toast.error(t('suppliers.form.validation_summary'));
  };

  return (
    <div className={cn('mx-auto flex w-full max-w-lg flex-col gap-4', variant === 'page' ? 'p-4' : '')}>
      {variant === 'page' ? (
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
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((v) => save.mutate(v), onInvalid)}
        noValidate
      >
        <div className="grid gap-2">
          <Label htmlFor="sup-fn">{t('suppliers.form.first_name')}</Label>
          <Input
            id="sup-fn"
            aria-invalid={errors.first_name ? true : undefined}
            {...form.register('first_name')}
          />
          <FieldError message={errors.first_name?.message} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sup-father">{t('suppliers.form.father_name')}</Label>
          <Input id="sup-father" {...form.register('father_name')} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sup-family">{t('suppliers.form.family_name')}</Label>
          <Input id="sup-family" {...form.register('family_name')} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currency_code">{t('suppliers.form.currency_code')}</Label>
          <CurrencySelect
            value={form.watch('currency_code')}
            onValueChange={(v) =>
              form.setValue('currency_code', v, { shouldDirty: true, shouldValidate: true })
            }
          />
          <FieldError message={errors.currency_code?.message} />
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
        <div className="grid gap-2">
          <Label htmlFor="contact_phone">{t('suppliers.form.contact_phone')}</Label>
          <Input
            id="contact_phone"
            aria-invalid={errors.contact_phone ? true : undefined}
            {...form.register('contact_phone')}
          />
          <FieldError message={errors.contact_phone?.message} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact_email">{t('suppliers.form.contact_email')}</Label>
          <Input
            id="contact_email"
            type="email"
            aria-invalid={errors.contact_email ? true : undefined}
            {...form.register('contact_email')}
          />
          <FieldError message={errors.contact_email?.message} />
        </div>
        <div className="grid gap-2">
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
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {payableAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.code} - {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('suppliers.form.payables_hint')}</p>
        </div>
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
      </form>
    </div>
  );
}

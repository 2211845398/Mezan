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
import { chartAccountsQueryOptions } from '@/features/accounting/queries';
import { zodLibyanPhoneOptional, zodOptionalNonEmptyEmail, normalizeLyPhoneInput } from '@/lib/validation/contact';
import { cn } from '@/lib/utils';

import { createSupplier, updateSupplier } from '../../api';
import { purchasingKeys, supplierQueryOptions } from '../../queries';

function supplierFormSchema(tc: TFunction<'common'>) {
  return z.object({
    code: z.string().min(1).max(64),
    first_name: z.string().min(1).max(255),
    father_name: z.string().max(255),
    family_name: z.string().max(255),
    currency_id: z.coerce.number().int().positive(),
    payables_account_id: z.string().optional(),
    tax_id: z.string().max(64).optional().nullable(),
    payment_terms: z.string().max(512).optional().nullable(),
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

export default function SupplierForm({ variant = 'page', onDismiss, editId }: SupplierFormProps = {}) {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('purchasing');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const pathnameIsNew = /\/purchasing\/suppliers\/new\/?$/.test(location.pathname);
  // In dialog mode: if editId is provided, it's an edit; otherwise it's new
  const isNew = variant === 'dialog' ? editId == null : pathnameIsNew || id === 'new';
  const supplierId = editId != null ? editId : (!isNew && id ? Number(id) : NaN);

  const { data: existing } = useQuery({
    ...supplierQueryOptions(supplierId),
    enabled: !isNew && !Number.isNaN(supplierId),
  });

  const { data: accounts = [] } = useQuery(chartAccountsQueryOptions());

  const schema = useMemo(() => supplierFormSchema(tc), [tc]);

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: isNew ? `SUP-${Math.floor(Date.now() / 1000)}` : '',
      first_name: '',
      father_name: '',
      family_name: '',
      currency_id: 1,
      payables_account_id: '',
      tax_id: '',
      payment_terms: '',
      contact_phone: '',
      contact_email: '',
    },
  });

  useEffect(() => {
    if (!existing) {
      return;
    }
    const c = existing.contact as Record<string, string | undefined> | undefined;
    form.reset({
      code: existing.code,
      first_name: existing.first_name ?? '',
      father_name: existing.father_name ?? '',
      family_name: existing.family_name ?? '',
      currency_id: existing.currency_id,
      payables_account_id: existing.payables_account_id != null ? String(existing.payables_account_id) : '',
      tax_id: existing.tax_id ?? '',
      payment_terms: existing.payment_terms ?? '',
      contact_phone: c?.phone ?? '',
      contact_email: c?.email ?? '',
    });
  }, [existing, form]);

  const save = useMutation({
    mutationFn: async (values: SupplierFormValues) => {
      const contact: Record<string, string> = {};
      const p = values.contact_phone.trim();
      if (p) contact.phone = normalizeLyPhoneInput(p);
      const em = values.contact_email.trim();
      if (em) contact.email = em;
      const payRaw = values.payables_account_id?.trim();
      const pay = payRaw ? Number(payRaw) : null;
      if (isNew) {
        return createSupplier({
          code: values.code,
          first_name: values.first_name.trim(),
          father_name: values.father_name.trim() || null,
          family_name: values.family_name.trim() || null,
          currency_id: values.currency_id,
          payables_account_id: pay,
          tax_id: values.tax_id || null,
          payment_terms: values.payment_terms || null,
          contact,
        });
      }
      return updateSupplier(supplierId, {
        first_name: values.first_name.trim(),
        father_name: values.father_name.trim() || null,
        family_name: values.family_name.trim() || null,
        currency_id: values.currency_id,
        payables_account_id: pay,
        tax_id: values.tax_id || null,
        payment_terms: values.payment_terms || null,
        contact,
      });
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

  return (
    <div className={cn('mx-auto flex w-full max-w-lg flex-col gap-4', variant === 'page' ? 'p-4' : '')}>
      {variant === 'page' ? (
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{isNew ? t('suppliers.new') : t('suppliers.edit')}</h1>
          <Button type="button" variant="outline" asChild>
            <Link to="/purchasing/suppliers">{t('suppliers.title')}</Link>
          </Button>
        </div>
      ) : null}
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
      >
        <div className="grid gap-2">
          <Label htmlFor="code">{t('suppliers.form.code')}</Label>
          <Input id="code" disabled={!isNew} {...form.register('code')} />
          {isNew ? (
            <p className="text-xs text-muted-foreground">Auto-generated fallback. Proper code generation requires backend update.</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sup-fn">{t('suppliers.form.first_name')}</Label>
          <Input id="sup-fn" {...form.register('first_name')} />
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
          <Label htmlFor="currency_id">{t('suppliers.form.currency_id')}</Label>
          <Input id="currency_id" type="number" {...form.register('currency_id')} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tax_id">{t('suppliers.form.tax_id')}</Label>
          <Input id="tax_id" {...form.register('tax_id')} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payment_terms">{t('suppliers.form.payment_terms')}</Label>
          <Select
            value={form.watch('payment_terms') || '__none'}
            onValueChange={(v) => form.setValue('payment_terms', v === '__none' ? '' : v, { shouldDirty: true, shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              <SelectItem value="Net 0">Net 0 (Due on receipt)</SelectItem>
              <SelectItem value="Net 15">Net 15</SelectItem>
              <SelectItem value="Net 30">Net 30</SelectItem>
              <SelectItem value="Net 45">Net 45</SelectItem>
              <SelectItem value="Net 60">Net 60</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact_phone">{t('suppliers.form.contact_phone')}</Label>
          <Input id="contact_phone" {...form.register('contact_phone')} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact_email">{t('suppliers.form.contact_email')}</Label>
          <Input id="contact_email" type="email" {...form.register('contact_email')} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payables_account_id">{t('suppliers.form.payables_account_id')}</Label>
          <Select
            value={form.watch('payables_account_id') || '__none'}
            onValueChange={(v) => form.setValue('payables_account_id', v === '__none' ? '' : v, { shouldDirty: true, shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.code} - {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

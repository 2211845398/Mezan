import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { chartAccountsQueryOptions } from '@/features/accounting/queries';

import { createSupplier, updateSupplier } from '../../api';
import { purchasingKeys, supplierQueryOptions } from '../../queries';

const schema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  currency_id: z.coerce.number().int().positive(),
  payables_account_id: z.string().optional(),
  tax_id: z.string().max(64).optional().nullable(),
  payment_terms: z.string().max(512).optional().nullable(),
  contact_phone: z.string().optional(),
  contact_email: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export type SupplierFormProps = {
  variant?: 'page' | 'dialog';
  onDismiss?: () => void;
};

export default function SupplierForm({ variant = 'page', onDismiss }: SupplierFormProps = {}) {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('purchasing');
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const pathnameIsNew = /\/purchasing\/suppliers\/new\/?$/.test(location.pathname);
  const isNew = variant === 'dialog' ? true : pathnameIsNew || id === 'new';
  const supplierId = !isNew && id ? Number(id) : NaN;

  const { data: existing } = useQuery({
    ...supplierQueryOptions(supplierId),
    enabled: !isNew && !Number.isNaN(supplierId),
  });

  const { data: accounts = [] } = useQuery(chartAccountsQueryOptions());

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: isNew ? `SUP-${Math.floor(Date.now() / 1000)}` : '',
      name: '',
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
      name: existing.name,
      currency_id: existing.currency_id,
      payables_account_id: existing.payables_account_id != null ? String(existing.payables_account_id) : '',
      tax_id: existing.tax_id ?? '',
      payment_terms: existing.payment_terms ?? '',
      contact_phone: c?.phone ?? '',
      contact_email: c?.email ?? '',
    });
  }, [existing, form]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const contact: Record<string, string> = {};
      if (values.contact_phone) contact.phone = values.contact_phone;
      if (values.contact_email) contact.email = values.contact_email;
      const payRaw = values.payables_account_id?.trim();
      const pay = payRaw ? Number(payRaw) : null;
      if (isNew) {
        return createSupplier({
          code: values.code,
          name: values.name,
          currency_id: values.currency_id,
          payables_account_id: pay,
          tax_id: values.tax_id || null,
          payment_terms: values.payment_terms || null,
          contact,
        });
      }
      return updateSupplier(supplierId, {
        name: values.name,
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
          <Label htmlFor="name">{t('suppliers.form.name')}</Label>
          <Input id="name" {...form.register('name')} />
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

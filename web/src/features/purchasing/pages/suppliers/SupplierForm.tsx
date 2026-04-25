import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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

export default function SupplierForm() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('purchasing');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = id === 'new';
  const supplierId = id && !isNew ? Number(id) : NaN;

  const { data: existing } = useQuery({
    ...supplierQueryOptions(supplierId),
    enabled: !isNew && !Number.isNaN(supplierId),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: '',
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
      if (isNew) {
        navigate(`/purchasing/suppliers/${row.id}/edit`, { replace: true });
      }
    },
    onError: () => toast.error(t('errors.generic')),
  });

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{isNew ? t('suppliers.new') : t('suppliers.edit')}</h1>
        <Button type="button" variant="outline" asChild>
          <Link to="/purchasing/suppliers">{t('suppliers.title')}</Link>
        </Button>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
      >
        <div className="grid gap-2">
          <Label htmlFor="code">{t('suppliers.form.code')}</Label>
          <Input id="code" disabled={!isNew} {...form.register('code')} />
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
          <Textarea id="payment_terms" rows={2} {...form.register('payment_terms')} />
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
          <Input id="payables_account_id" type="number" {...form.register('payables_account_id')} />
        </div>
        <Button type="submit" disabled={save.isPending}>
          {t('suppliers.form.save')}
        </Button>
      </form>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { createCustomer, updateCustomer } from '../../api';
import { crmKeys, customerDetailQueryOptions } from '../../queries';

export type CustomerFormProps = {
  variant?: 'page' | 'dialog';
  onDismiss?: () => void;
};

export default function CustomerForm({ variant = 'page', onDismiss }: CustomerFormProps = {}) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const editId = id ? Number(id) : NaN;
  const isEdit = variant === 'dialog' ? false : Boolean(id) && location.pathname.endsWith('/edit') && !Number.isNaN(editId);
  const { t } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: existing } = useQuery({
    ...customerDetailQueryOptions(editId),
    enabled: isEdit && editId > 0,
  });
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [temporary, setTemporary] = useState(false);

  useEffect(() => {
    if (existing) {
      setPhone(existing.phone);
      setFullName(existing.full_name ?? '');
      setEmail(existing.email ?? '');
      setTemporary(existing.is_temporary);
    }
  }, [existing]);

  const mCreate = useMutation({
    mutationFn: () =>
      createCustomer({
        phone,
        full_name: fullName || null,
        email: email || null,
        is_temporary: temporary,
        default_currency_id: null,
        receivables_account_id: null,
      }),
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: crmKeys.root });
      toast.success(t('customers.saved'));
      if (variant === 'dialog') {
        onDismiss?.();
        return;
      }
      void nav(`/crm/customers/${c.id}`);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const mUpdate = useMutation({
    mutationFn: () =>
      updateCustomer(editId, {
        full_name: fullName || null,
        email: email || null,
        is_temporary: temporary,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.root });
      toast.success(t('customers.saved'));
      if (variant === 'dialog') {
        onDismiss?.();
        return;
      }
      void nav(`/crm/customers/${editId}`);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const submit = () => {
    if (!isEdit) {
      if (!phone.trim()) {
        toast.error(t('customers.phone_required'));
        return;
      }
      void mCreate.mutate();
    } else {
      void mUpdate.mutate();
    }
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{isEdit ? t('customers.edit_title') : t('customers.new_title')}</h1>
      {!isEdit ? (
        <div className="grid gap-1">
          <Label>{t('customers.phone')}</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('customers.phone_locked', { phone: existing?.phone })}</p>
      )}
      <div className="grid gap-1">
        <Label>{t('customers.full_name')}</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <p className="text-xs text-muted-foreground">Splitting into first/father/last name requires backend OpenAPI support.</p>
      </div>
      <div className="grid gap-1">
        <Label>{t('customers.email')}</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="tmp" checked={temporary} onCheckedChange={setTemporary} />
        <Label htmlFor="tmp">{t('customers.temporary')}</Label>
      </div>
      <p className="text-xs text-muted-foreground">The full temporary customer approval flow requires backend API extensions (status, manager approval routes).</p>
      <div className="flex gap-2">
        <Button type="button" disabled={mCreate.isPending || mUpdate.isPending} onClick={submit}>
          {tc('actions.save')}
        </Button>
        {variant === 'dialog' && onDismiss ? (
          <Button type="button" variant="outline" onClick={onDismiss}>
            {tc('actions.cancel')}
          </Button>
        ) : (
          <Button type="button" variant="outline" asChild>
            <Link to={isEdit ? `/crm/customers/${editId}` : '/crm/customers'}>{tc('actions.cancel')}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

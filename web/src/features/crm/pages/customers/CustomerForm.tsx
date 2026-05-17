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
import { isLibyanMobilePhone, isNonEmptyValidEmail, normalizeLyPhoneInput } from '@/lib/validation/contact';

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
  const isEdit =
    variant === 'dialog'
      ? false
      : Boolean(id) && location.pathname.endsWith('/edit') && !Number.isNaN(editId);
  const { t } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: existing } = useQuery({
    ...customerDetailQueryOptions(editId),
    enabled: isEdit && editId > 0,
  });
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [email, setEmail] = useState('');
  const [temporary, setTemporary] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (existing) {
      setPhone(existing.phone);
      setFirstName(existing.first_name ?? '');
      setFatherName(existing.father_name ?? '');
      setFamilyName(existing.family_name ?? '');
      setEmail(existing.email ?? '');
      setTemporary(existing.is_temporary);
      setActive(existing.is_active);
    }
  }, [existing]);

  const mCreate = useMutation({
    mutationFn: () =>
      createCustomer({
        phone: normalizeLyPhoneInput(phone.trim()),
        first_name: firstName || null,
        father_name: fatherName || null,
        family_name: familyName || null,
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
        first_name: firstName || null,
        father_name: fatherName || null,
        family_name: familyName || null,
        email: email || null,
        is_temporary: temporary,
        is_active: active,
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
      if (!isLibyanMobilePhone(phone)) {
        toast.error(tc('errors.validation_phone_ly'));
        return;
      }
      void mCreate.mutate();
    } else {
      if (!isNonEmptyValidEmail(email)) {
        toast.error(tc('errors.validation_email'));
        return;
      }
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
        <Label>{t('customers.first_name')}</Label>
        <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label>{t('customers.father_name')}</Label>
        <Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label>{t('customers.family_name')}</Label>
        <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label>{t('customers.email')}</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="tmp" checked={temporary} onCheckedChange={setTemporary} />
        <Label htmlFor="tmp">{t('customers.temporary')}</Label>
      </div>
      {isEdit ? (
        <div className="flex items-center gap-2">
          <Switch id="act" checked={active} onCheckedChange={setActive} />
          <Label htmlFor="act">{t('customers.active_label')}</Label>
        </div>
      ) : null}
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

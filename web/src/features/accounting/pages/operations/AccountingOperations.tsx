import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

import { SectionCard } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { PageTabNav } from '@/components/shared/PageTabNav';
import { PageHeader } from '@/components/shared/PageHeader';
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
import { notifyApiError } from '@/api/errorMessages';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { listCustomers } from '@/features/crm/api';
import { listSuppliers } from '@/features/purchasing/api';
import { now, utcCalendarDayKey } from '@/lib/date';
import { newIdempotencyKey } from '@/lib/idempotency';

import PostableAccountPicker from '../../components/PostableAccountPicker';
import {
  postOpeningBalance,
  postPaymentVoucher,
  postReceiptVoucher,
} from '../../api';

type OperationsTab = 'vouchers' | 'opening';

export default function AccountingOperations() {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const [tab, setTab] = useState<OperationsTab>('vouchers');
  const branchId = useAuthStore((s) => s.activeBranchId) ?? 0;
  const today = useMemo(() => utcCalendarDayKey(now()), []);
  const [entryDate, setEntryDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [debitAccountId, setDebitAccountId] = useState<number | null>(null);
  const [creditAccountId, setCreditAccountId] = useState<number | null>(null);
  const [description, setDescription] = useState('');

  const customers = useQuery({
    queryKey: ['crm', 'customers', 'list'],
    queryFn: async () => {
      const res = await listCustomers({ limit: 50, offset: 0 });
      return res.items;
    },
  });
  const suppliers = useQuery({
    queryKey: ['purchasing', 'suppliers', 'list'],
    queryFn: async () => {
      const res = await listSuppliers({ limit: 50, offset: 0 });
      return res.items;
    },
  });

  const receipt = useMutation({
    mutationFn: () =>
      postReceiptVoucher(
        {
          customer_id: customerId ? Number(customerId) : null,
          amount,
          entry_date: entryDate,
          description: description || t('operations.voucher.receipt_default_desc'),
          reference: null,
          branch_id: branchId,
          memo: '',
          idempotency_key: newIdempotencyKey(),
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => toast.success(result.message ?? t('operations.voucher.receipt_ok')),
    onError: (error) => notifyApiError(error, tc('errors.generic')),
  });

  const payment = useMutation({
    mutationFn: () =>
      postPaymentVoucher(
        {
          supplier_id: supplierId ? Number(supplierId) : null,
          amount,
          entry_date: entryDate,
          description: description || t('operations.voucher.payment_default_desc'),
          reference: null,
          branch_id: branchId,
          memo: '',
          idempotency_key: newIdempotencyKey(),
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => toast.success(result.message ?? t('operations.voucher.payment_ok')),
    onError: (error) => notifyApiError(error, tc('errors.generic')),
  });

  const opening = useMutation({
    mutationFn: () =>
      postOpeningBalance(
        {
          entry_date: entryDate,
          description: description || t('operations.opening.default_desc'),
          reference: null,
          branch_id: branchId,
          lines: [
            { account_id: debitAccountId!, debit: amount, credit: '0', memo: '' },
            { account_id: creditAccountId!, debit: '0', credit: amount, memo: '' },
          ],
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => toast.success(result.message ?? t('operations.opening.ok')),
    onError: (error) => notifyApiError(error, tc('errors.generic')),
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title={t('operations.title')} />
      <PageTabNav
        mode="button"
        activeId={tab}
        onSelect={(id) => setTab(id as OperationsTab)}
        items={[
          { id: 'vouchers', label: t('operations.tab.vouchers'), icon: FileText },
          { id: 'opening', label: t('operations.tab.opening'), icon: BookOpen },
        ]}
      />

      {tab === 'vouchers' ? (
        <div className="mt-4 space-y-4">
          <SectionCard title={t('operations.voucher.title')}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <Label>{t('operations.voucher.date')}</Label>
                <DateField value={entryDate} onChange={setEntryDate} />
              </div>
              <div className="grid gap-1">
                <Label>{t('operations.voucher.amount')}</Label>
                <MoneyInput value={amount} onChange={setAmount} />
              </div>
              <div className="grid gap-1">
                <Label>{t('operations.voucher.description')}</Label>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{t('operations.voucher.receipt_section')}</p>
              <div className="grid gap-1">
                <Label>{t('operations.voucher.customer')}</Label>
                <Select value={customerId || '__none'} onValueChange={(v) => setCustomerId(v === '__none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t('operations.voucher.no_entity')}</SelectItem>
                    {(customers.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {[c.first_name, c.father_name, c.family_name].filter(Boolean).join(' ') ||
                          `#${c.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={() => receipt.mutate()}
                disabled={!amount || receipt.isPending}
              >
                {t('operations.voucher.post_receipt')}
              </Button>
            </div>

            <div className="mt-3 space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{t('operations.voucher.payment_section')}</p>
              <div className="grid gap-1">
                <Label>{t('operations.voucher.supplier')}</Label>
                <Select value={supplierId || '__none'} onValueChange={(v) => setSupplierId(v === '__none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t('operations.voucher.no_entity')}</SelectItem>
                    {(suppliers.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  'border-secondary bg-background text-secondary hover:border-secondary hover:bg-secondary/10 hover:text-secondary',
                )}
                onClick={() => payment.mutate()}
                disabled={!amount || payment.isPending}
              >
                {t('operations.voucher.post_payment')}
              </Button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === 'opening' ? (
        <div className="mt-4">
          <SectionCard title={t('operations.opening.title')}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <Label>{t('operations.opening.date')}</Label>
                <DateField value={entryDate} onChange={setEntryDate} />
              </div>
              <div className="grid gap-1">
                <Label>{t('operations.opening.amount')}</Label>
                <MoneyInput value={amount} onChange={setAmount} />
              </div>
              <div className="grid gap-1">
                <Label>{t('operations.opening.debit_account')}</Label>
                <PostableAccountPicker
                  value={debitAccountId}
                  onChange={(a) => setDebitAccountId(a?.id ?? null)}
                />
              </div>
              <div className="grid gap-1">
                <Label>{t('operations.opening.credit_account')}</Label>
                <PostableAccountPicker
                  value={creditAccountId}
                  onChange={(a) => setCreditAccountId(a?.id ?? null)}
                />
              </div>
              <div className="grid gap-1 md:col-span-2">
                <Label>{t('operations.opening.description')}</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
            <Button
              type="button"
              className="mt-4"
              onClick={() => opening.mutate()}
              disabled={!amount || debitAccountId == null || creditAccountId == null || opening.isPending}
            >
              {t('operations.opening.post')}
            </Button>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

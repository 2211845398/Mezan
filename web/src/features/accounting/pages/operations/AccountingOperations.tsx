import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ArrowRightLeft, FileText, Receipt, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

import { SectionCard } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { PageTabNav } from '@/components/shared/PageTabNav';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { notifyApiError } from '@/api/errorMessages';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { now, utcCalendarDayKey } from '@/lib/date';
import { newIdempotencyKey } from '@/lib/idempotency';

import SubledgerEntityPicker from '../../components/SubledgerEntityPicker';
import PostableAccountPicker from '../../components/PostableAccountPicker';
import {
  postExpenseVoucher,
  postInternalTransfer,
  postOpeningBalance,
  postPaymentVoucher,
  postReceiptVoucher,
  type AccountingPostResult,
} from '../../api';
import { accountingKeys } from '../../queries';

type VoucherTab = 'receipt' | 'payment' | 'expense' | 'transfer' | 'opening';

interface VoucherSuccessToastProps {
  result: AccountingPostResult;
  t: (key: string) => string;
}

function VoucherSuccessToast({ result, t }: VoucherSuccessToastProps) {
  const hasJournalEntry = result.journal_entry_id != null;
  const hasJournalEntries = result.journal_entry_ids && result.journal_entry_ids.length > 0;

  return (
    <div className="space-y-1">
      <p>{result.message}</p>
      {hasJournalEntry && (
        <p className="text-sm">
          <Link
            to={`/accounting/journal/${result.journal_entry_id}`}
            className="underline hover:text-primary"
          >
            {t('operations.voucher.view_journal_entry')} #{result.journal_entry_id}
          </Link>
        </p>
      )}
      {hasJournalEntries && (
        <p className="text-sm text-muted-foreground">
          {t('operations.voucher.entries_created')}: {result.journal_entry_ids?.length}
        </p>
      )}
    </div>
  );
}

export default function AccountingOperations() {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [tab, setTab] = useState<VoucherTab>('receipt');
  const branchId = useAuthStore((s) => s.activeBranchId) ?? 0;
  const today = useMemo(() => utcCalendarDayKey(now()), []);

  // Common fields
  const [entryDate, setEntryDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');

  // Receipt voucher fields
  const [receiptCustomerId, setReceiptCustomerId] = useState<number | null>(null);
  const [receiptCashAccountId, setReceiptCashAccountId] = useState<number | null>(null);

  // Payment voucher fields
  const [paymentSupplierId, setPaymentSupplierId] = useState<number | null>(null);
  const [paymentCashAccountId, setPaymentCashAccountId] = useState<number | null>(null);

  // Expense voucher fields
  const [expenseAccountId, setExpenseAccountId] = useState<number | null>(null);
  const [expenseCashAccountId, setExpenseCashAccountId] = useState<number | null>(null);

  // Transfer fields
  const [fromAccountId, setFromAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);

  // Opening balance fields
  const [openingDebitAccountId, setOpeningDebitAccountId] = useState<number | null>(null);
  const [openingCreditAccountId, setOpeningCreditAccountId] = useState<number | null>(null);

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setReference('');
  };

  const resetReceipt = () => {
    setReceiptCustomerId(null);
    setReceiptCashAccountId(null);
    resetForm();
  };

  const resetPayment = () => {
    setPaymentSupplierId(null);
    setPaymentCashAccountId(null);
    resetForm();
  };

  const resetExpense = () => {
    setExpenseAccountId(null);
    setExpenseCashAccountId(null);
    resetForm();
  };

  const resetTransfer = () => {
    setFromAccountId(null);
    setToAccountId(null);
    resetForm();
  };

  const resetOpening = () => {
    setOpeningDebitAccountId(null);
    setOpeningCreditAccountId(null);
    resetForm();
  };

  const invalidateAccountingCache = async () => {
    await qc.invalidateQueries({ queryKey: accountingKeys.root });
  };

  // Receipt voucher mutation
  const receiptMutation = useMutation({
    mutationFn: () =>
      postReceiptVoucher(
        {
          customer_id: receiptCustomerId,
          cash_account_id: receiptCashAccountId,
          amount,
          entry_date: entryDate,
          description: description || t('operations.receipt.default_desc'),
          reference: reference || null,
          branch_id: branchId,
          memo: '',
          idempotency_key: newIdempotencyKey(),
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => {
      toast.success(<VoucherSuccessToast result={result} t={t} />);
      void invalidateAccountingCache();
      resetReceipt();
    },
    onError: (error) => notifyApiError(error, tc('errors.generic')),
  });

  // Payment voucher mutation
  const paymentMutation = useMutation({
    mutationFn: () =>
      postPaymentVoucher(
        {
          supplier_id: paymentSupplierId,
          cash_account_id: paymentCashAccountId,
          amount,
          entry_date: entryDate,
          description: description || t('operations.payment.default_desc'),
          reference: reference || null,
          branch_id: branchId,
          memo: '',
          idempotency_key: newIdempotencyKey(),
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => {
      toast.success(<VoucherSuccessToast result={result} t={t} />);
      void invalidateAccountingCache();
      resetPayment();
    },
    onError: (error) => notifyApiError(error, tc('errors.generic')),
  });

  // Expense voucher mutation
  const expenseMutation = useMutation({
    mutationFn: () =>
      postExpenseVoucher(
        {
          expense_account_id: expenseAccountId!,
          cash_account_id: expenseCashAccountId,
          amount,
          entry_date: entryDate,
          description: description || t('operations.expense.default_desc'),
          reference: reference || null,
          branch_id: branchId,
          memo: '',
          idempotency_key: newIdempotencyKey(),
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => {
      toast.success(<VoucherSuccessToast result={result} t={t} />);
      void invalidateAccountingCache();
      resetExpense();
    },
    onError: (error) => notifyApiError(error, tc('errors.generic')),
  });

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: () =>
      postInternalTransfer(
        {
          from_cash_account_id: fromAccountId!,
          to_cash_account_id: toAccountId!,
          amount,
          entry_date: entryDate,
          description: description || t('operations.transfer.default_desc'),
          reference: reference || null,
          branch_id: branchId,
          memo: '',
          idempotency_key: newIdempotencyKey(),
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => {
      toast.success(<VoucherSuccessToast result={result} t={t} />);
      void invalidateAccountingCache();
      resetTransfer();
    },
    onError: (error) => notifyApiError(error, tc('errors.generic')),
  });

  // Opening balance mutation
  const openingMutation = useMutation({
    mutationFn: () =>
      postOpeningBalance(
        {
          entry_date: entryDate,
          description: description || t('operations.opening.default_desc'),
          reference: reference || null,
          branch_id: branchId,
          lines: [
            { account_id: openingDebitAccountId!, debit: amount, credit: '0', memo: '' },
            { account_id: openingCreditAccountId!, debit: '0', credit: amount, memo: '' },
          ],
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => {
      toast.success(result.message ?? t('operations.opening.ok'));
      void invalidateAccountingCache();
      resetOpening();
    },
    onError: (error) => notifyApiError(error, tc('errors.generic')),
  });

  const tabItems = [
    { id: 'receipt' as const, label: t('operations.tab.receipt'), icon: Receipt },
    { id: 'payment' as const, label: t('operations.tab.payment'), icon: Wallet },
    { id: 'expense' as const, label: t('operations.tab.expense'), icon: FileText },
    { id: 'transfer' as const, label: t('operations.tab.transfer'), icon: ArrowRightLeft },
    { id: 'opening' as const, label: t('operations.tab.opening'), icon: BookOpen },
  ];

  const isReceiptValid = amount && receiptCustomerId != null;
  const isPaymentValid = amount && paymentSupplierId != null;
  const isExpenseValid = amount && expenseAccountId != null;
  const isTransferValid = amount && fromAccountId != null && toAccountId != null && fromAccountId !== toAccountId;
  const isOpeningValid = amount && openingDebitAccountId != null && openingCreditAccountId != null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title={t('operations.title')} />
      <PageTabNav
        mode="button"
        activeId={tab}
        onSelect={(id) => setTab(id as VoucherTab)}
        items={tabItems}
      />

      {/* Receipt Voucher */}
      {tab === 'receipt' && (
        <SectionCard title={t('operations.receipt.title')}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.common.date')}</Label>
              <DateField value={entryDate} onChange={setEntryDate} />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.amount')}</Label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.reference')}</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t('operations.common.reference_placeholder')}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>{t('operations.common.description')}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('operations.receipt.description_placeholder')}
              />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.receipt.customer')}</Label>
              <SubledgerEntityPicker
                kind="customer"
                value={receiptCustomerId}
                onChange={setReceiptCustomerId}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.cash_account')}</Label>
              <PostableAccountPicker
                value={receiptCashAccountId}
                onChange={(a) => setReceiptCashAccountId(a?.id ?? null)}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => receiptMutation.mutate()}
              disabled={!isReceiptValid || receiptMutation.isPending}
            >
              {receiptMutation.isPending ? t('operations.common.posting') : t('operations.receipt.post')}
            </Button>
            <Button variant="outline" onClick={resetReceipt}>
              {tc('actions.cancel')}
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Payment Voucher */}
      {tab === 'payment' && (
        <SectionCard title={t('operations.payment.title')}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.common.date')}</Label>
              <DateField value={entryDate} onChange={setEntryDate} />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.amount')}</Label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.reference')}</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t('operations.common.reference_placeholder')}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>{t('operations.common.description')}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('operations.payment.description_placeholder')}
              />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.payment.supplier')}</Label>
              <SubledgerEntityPicker
                kind="supplier"
                value={paymentSupplierId}
                onChange={setPaymentSupplierId}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.cash_account')}</Label>
              <PostableAccountPicker
                value={paymentCashAccountId}
                onChange={(a) => setPaymentCashAccountId(a?.id ?? null)}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => paymentMutation.mutate()}
              disabled={!isPaymentValid || paymentMutation.isPending}
            >
              {paymentMutation.isPending ? t('operations.common.posting') : t('operations.payment.post')}
            </Button>
            <Button variant="outline" onClick={resetPayment}>
              {tc('actions.cancel')}
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Expense Voucher */}
      {tab === 'expense' && (
        <SectionCard title={t('operations.expense.title')}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.common.date')}</Label>
              <DateField value={entryDate} onChange={setEntryDate} />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.amount')}</Label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.reference')}</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t('operations.common.reference_placeholder')}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>{t('operations.common.description')}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('operations.expense.description_placeholder')}
              />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.expense.expense_account')}</Label>
              <PostableAccountPicker
                value={expenseAccountId}
                onChange={(a) => setExpenseAccountId(a?.id ?? null)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.cash_account')}</Label>
              <PostableAccountPicker
                value={expenseCashAccountId}
                onChange={(a) => setExpenseCashAccountId(a?.id ?? null)}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => expenseMutation.mutate()}
              disabled={!isExpenseValid || expenseMutation.isPending}
            >
              {expenseMutation.isPending ? t('operations.common.posting') : t('operations.expense.post')}
            </Button>
            <Button variant="outline" onClick={resetExpense}>
              {tc('actions.cancel')}
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Internal Transfer */}
      {tab === 'transfer' && (
        <SectionCard title={t('operations.transfer.title')}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.common.date')}</Label>
              <DateField value={entryDate} onChange={setEntryDate} />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.amount')}</Label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.reference')}</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t('operations.common.reference_placeholder')}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>{t('operations.common.description')}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('operations.transfer.description_placeholder')}
              />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.transfer.from_account')}</Label>
              <PostableAccountPicker
                value={fromAccountId}
                onChange={(a) => setFromAccountId(a?.id ?? null)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.transfer.to_account')}</Label>
              <PostableAccountPicker
                value={toAccountId}
                onChange={(a) => setToAccountId(a?.id ?? null)}
              />
            </div>
          </div>

          {fromAccountId === toAccountId && toAccountId != null && (
            <p className="mt-2 text-sm text-destructive">{t('operations.transfer.same_account_error')}</p>
          )}

          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => transferMutation.mutate()}
              disabled={!isTransferValid || transferMutation.isPending}
            >
              {transferMutation.isPending ? t('operations.common.posting') : t('operations.transfer.post')}
            </Button>
            <Button variant="outline" onClick={resetTransfer}>
              {tc('actions.cancel')}
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Opening Balance */}
      {tab === 'opening' && (
        <SectionCard title={t('operations.opening.title')}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.common.date')}</Label>
              <DateField value={entryDate} onChange={setEntryDate} />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.common.amount')}</Label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>{t('operations.common.description')}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('operations.opening.description_placeholder')}
              />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('operations.opening.debit_account')}</Label>
              <PostableAccountPicker
                value={openingDebitAccountId}
                onChange={(a) => setOpeningDebitAccountId(a?.id ?? null)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('operations.opening.credit_account')}</Label>
              <PostableAccountPicker
                value={openingCreditAccountId}
                onChange={(a) => setOpeningCreditAccountId(a?.id ?? null)}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => openingMutation.mutate()}
              disabled={!isOpeningValid || openingMutation.isPending}
            >
              {openingMutation.isPending ? t('operations.common.posting') : t('operations.opening.post')}
            </Button>
            <Button variant="outline" onClick={resetOpening}>
              {tc('actions.cancel')}
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

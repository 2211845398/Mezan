import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { SectionCard } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { now, utcCalendarDayKey } from '@/lib/date';
import { newIdempotencyKey } from '@/lib/idempotency';
import { notify } from '@/lib/toast';

import {
  type ChartAccountTreeNode,
  listBoms,
  listChartAccountsTree,
  postOpeningBalance,
  postPaymentVoucher,
  postReceiptVoucher,
  previewFxRevaluation,
  runFxRevaluation,
} from '../../api';
import { accountingKeys } from '../../queries';

function AccountTree({ nodes, level = 0 }: { nodes: ChartAccountTreeNode[]; level?: number }) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <div key={node.id}>
          <div
            className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
            style={{ marginInlineStart: level * 14 }}
          >
            <span className="font-medium">
              {node.code} · {node.name}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {node.account_type}
            </span>
          </div>
          {node.children?.length ? <AccountTree nodes={node.children} level={level + 1} /> : null}
        </div>
      ))}
    </div>
  );
}

export default function AccountingOperations() {
  const branchId = useAuthStore((s) => s.activeBranchId) ?? 0;
  const today = useMemo(() => utcCalendarDayKey(now()), []);
  const [entryDate, setEntryDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [entityId, setEntityId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [fxDate, setFxDate] = useState(today);

  const tree = useQuery({
    queryKey: accountingKeys.chartAccountsTree(),
    queryFn: listChartAccountsTree,
  });
  const boms = useQuery({
    queryKey: accountingKeys.boms(),
    queryFn: listBoms,
  });

  const receipt = useMutation({
    mutationFn: () =>
      postReceiptVoucher(
        {
          customer_id: entityId ? Number(entityId) : null,
          amount,
          entry_date: entryDate,
          description: description || 'Customer receipt',
          reference: null,
          branch_id: branchId,
          memo: '',
          idempotency_key: newIdempotencyKey(),
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => notify.success(result.message ?? 'تم ترحيل سند القبض'),
    onError: (error) => notify.error(error instanceof Error ? error.message : String(error)),
  });

  const payment = useMutation({
    mutationFn: () =>
      postPaymentVoucher(
        {
          supplier_id: entityId ? Number(entityId) : null,
          amount,
          entry_date: entryDate,
          description: description || 'Supplier payment',
          reference: null,
          branch_id: branchId,
          memo: '',
          idempotency_key: newIdempotencyKey(),
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => notify.success(result.message ?? 'تم ترحيل سند الدفع'),
    onError: (error) => notify.error(error instanceof Error ? error.message : String(error)),
  });

  const opening = useMutation({
    mutationFn: () =>
      postOpeningBalance(
        {
          entry_date: entryDate,
          description: description || 'Opening balance',
          reference: null,
          branch_id: branchId,
          lines: [
            { account_id: Number(accountId), debit: amount, credit: '0', memo: '' },
            { account_id: Number(creditAccountId), debit: '0', credit: amount, memo: '' },
          ],
        },
        newIdempotencyKey(),
      ),
    onSuccess: (result) => notify.success(result.message ?? 'تم ترحيل القيد الافتتاحي'),
    onError: (error) => notify.error(error instanceof Error ? error.message : String(error)),
  });

  const fxPreview = useMutation({
    mutationFn: () => previewFxRevaluation({ as_of: fxDate, branch_id: branchId || null }),
    onSuccess: () => notify.success('تم تجهيز معاينة فروقات العملة'),
    onError: (error) => notify.error(error instanceof Error ? error.message : String(error)),
  });

  const fxRun = useMutation({
    mutationFn: () => runFxRevaluation({ as_of: fxDate, branch_id: branchId || null }, newIdempotencyKey()),
    onSuccess: () => notify.success('تم ترحيل فروقات العملة'),
    onError: (error) => notify.error(error instanceof Error ? error.message : String(error)),
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="عمليات المحاسبة"
        subtitle="واجهة واحدة للنمط المحاسبي الجديد: شجرة الحسابات، القسائم، الافتتاحيات، فروقات العملة، وأوامر الإنتاج."
      />
      <Tabs defaultValue="tree">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="tree">شجرة الحسابات</TabsTrigger>
          <TabsTrigger value="vouchers">القسائم</TabsTrigger>
          <TabsTrigger value="opening">الأرصدة الافتتاحية</TabsTrigger>
          <TabsTrigger value="fx">إعادة تقييم العملة</TabsTrigger>
          <TabsTrigger value="production">الإنتاج</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="mt-4">
          <SectionCard title="دليل الحسابات">
            {tree.isLoading ? <p className="text-sm text-muted-foreground">...</p> : null}
            {tree.data ? <AccountTree nodes={tree.data} /> : null}
          </SectionCard>
        </TabsContent>

        <TabsContent value="vouchers" className="mt-4">
          <SectionCard title="سند قبض / دفع">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <Label>التاريخ</Label>
                <DateField value={entryDate} onChange={setEntryDate} />
              </div>
              <div className="grid gap-1">
                <Label>المبلغ</Label>
                <MoneyInput value={amount} onChange={setAmount} />
              </div>
              <div className="grid gap-1">
                <Label>رقم العميل / المورد</Label>
                <Input value={entityId} onChange={(event) => setEntityId(event.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>الوصف</Label>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={() => receipt.mutate()} disabled={!amount || receipt.isPending}>
                ترحيل سند قبض
              </Button>
              <Button type="button" variant="secondary" onClick={() => payment.mutate()} disabled={!amount || payment.isPending}>
                ترحيل سند دفع
              </Button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="opening" className="mt-4">
          <SectionCard title="قيد افتتاحي">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-1">
                <Label>التاريخ</Label>
                <DateField value={entryDate} onChange={setEntryDate} />
              </div>
              <div className="grid gap-1">
                <Label>حساب مدين</Label>
                <Input value={accountId} onChange={(event) => setAccountId(event.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>حساب دائن</Label>
                <Input value={creditAccountId} onChange={(event) => setCreditAccountId(event.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>المبلغ</Label>
                <MoneyInput value={amount} onChange={setAmount} />
              </div>
            </div>
            <Button
              type="button"
              className="mt-4"
              onClick={() => opening.mutate()}
              disabled={!amount || !accountId || !creditAccountId || opening.isPending}
            >
              ترحيل قيد افتتاحي
            </Button>
          </SectionCard>
        </TabsContent>

        <TabsContent value="fx" className="mt-4">
          <SectionCard title="إعادة تقييم العملات">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <Label>حتى تاريخ</Label>
                <DateField value={fxDate} onChange={setFxDate} />
              </div>
              <Button type="button" variant="outline" onClick={() => fxPreview.mutate()}>
                معاينة
              </Button>
              <Button type="button" onClick={() => fxRun.mutate()}>
                ترحيل
              </Button>
            </div>
            {fxPreview.data ? (
              <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs" dir="ltr">
                {JSON.stringify(fxPreview.data, null, 2)}
              </pre>
            ) : null}
          </SectionCard>
        </TabsContent>

        <TabsContent value="production" className="mt-4">
          <SectionCard title="أوامر الإنتاج والـ BoM">
            <div className="grid gap-3 md:grid-cols-2">
              {(boms.data ?? []).map((bom) => (
                <div key={String(bom.id)} className="rounded-xl border bg-background p-3">
                  <p className="font-medium">{String(bom.name ?? 'BoM')}</p>
                  <p className="text-xs text-muted-foreground">
                    المنتج النهائي #{String(bom.finished_product_id ?? '—')} · إصدار {String(bom.version ?? '—')}
                  </p>
                </div>
              ))}
              {!boms.isLoading && !boms.data?.length ? (
                <p className="text-sm text-muted-foreground">لا توجد قوائم مواد بعد.</p>
              ) : null}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { SectionCard } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { listCustomers } from '@/features/crm/api';
import { listSuppliers } from '@/features/purchasing/api';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/idempotency';

import AccountPicker from '../../components/AccountPicker';
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

type FxPreviewLine = {
  account_id?: number;
  code?: string;
  name?: string;
  book_amount?: string | number;
  revalued_amount?: string | number;
  fx_gain_loss?: string | number;
};

export default function AccountingOperations() {
  const { t } = useTranslation('accounting');
  const branchId = useAuthStore((s) => s.activeBranchId) ?? 0;
  const today = useMemo(() => utcCalendarDayKey(now()), []);
  const [entryDate, setEntryDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [debitAccountId, setDebitAccountId] = useState<number | null>(null);
  const [creditAccountId, setCreditAccountId] = useState<number | null>(null);
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
  const customers = useQuery({
    queryKey: ['crm', 'customers', 'list'],
    queryFn: () => listCustomers({ limit: 200, offset: 0 }),
  });
  const suppliers = useQuery({
    queryKey: ['purchasing', 'suppliers', 'list'],
    queryFn: listSuppliers,
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
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
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
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
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
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const fxPreview = useMutation({
    mutationFn: () => previewFxRevaluation({ as_of: fxDate, branch_id: branchId || null }),
    onSuccess: () => toast.success(t('operations.fx.preview_ok')),
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const fxRun = useMutation({
    mutationFn: () => runFxRevaluation({ as_of: fxDate, branch_id: branchId || null }, newIdempotencyKey()),
    onSuccess: () => toast.success(t('operations.fx.run_ok')),
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  // Parse FX preview result into a renderable array
  const fxLines: FxPreviewLine[] = useMemo(() => {
    const data = fxPreview.data;
    if (!data) return [];
    if (Array.isArray(data)) return data as FxPreviewLine[];
    if (typeof data === 'object' && data !== null) {
      const d = data as Record<string, unknown>;
      if (Array.isArray(d.lines)) return d.lines as FxPreviewLine[];
    }
    return [];
  }, [fxPreview.data]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={t('operations.title')}
        subtitle={t('operations.subtitle')}
      />
      <Tabs defaultValue="tree">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="tree">{t('operations.tab.tree')}</TabsTrigger>
          <TabsTrigger value="vouchers">{t('operations.tab.vouchers')}</TabsTrigger>
          <TabsTrigger value="opening">{t('operations.tab.opening')}</TabsTrigger>
          <TabsTrigger value="fx">{t('operations.tab.fx')}</TabsTrigger>
          <TabsTrigger value="production">{t('operations.tab.production')}</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="mt-4">
          <SectionCard title={t('operations.tree.title')}>
            {tree.isLoading ? <p className="text-sm text-muted-foreground">{t('operations.loading')}</p> : null}
            {tree.data ? <AccountTree nodes={tree.data} /> : null}
          </SectionCard>
        </TabsContent>

        <TabsContent value="vouchers" className="mt-4 space-y-4">
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

            {/* Receipt: customer picker */}
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
                    {(customers.data?.items ?? []).map((c) => (
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

            {/* Payment: supplier picker */}
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
                variant="secondary"
                onClick={() => payment.mutate()}
                disabled={!amount || payment.isPending}
              >
                {t('operations.voucher.post_payment')}
              </Button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="opening" className="mt-4">
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
                <AccountPicker value={debitAccountId} onChange={setDebitAccountId} />
              </div>
              <div className="grid gap-1">
                <Label>{t('operations.opening.credit_account')}</Label>
                <AccountPicker value={creditAccountId} onChange={setCreditAccountId} />
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
        </TabsContent>

        <TabsContent value="fx" className="mt-4">
          <SectionCard title={t('operations.fx.title')}>
            <p className="mb-3 text-sm text-muted-foreground">
              <Link className="underline" to="/accounting/currencies">
                {t('currencies.link_fx', { ns: 'accounting' })}
              </Link>
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <Label>{t('operations.fx.as_of')}</Label>
                <DateField value={fxDate} onChange={setFxDate} />
              </div>
              <Button type="button" variant="outline" onClick={() => fxPreview.mutate()} disabled={fxPreview.isPending}>
                {t('operations.fx.preview')}
              </Button>
              <Button type="button" onClick={() => fxRun.mutate()} disabled={fxRun.isPending}>
                {t('operations.fx.post')}
              </Button>
            </div>

            {fxLines.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('operations.fx.col.code')}</TableHead>
                      <TableHead>{t('operations.fx.col.name')}</TableHead>
                      <TableHead className="text-end">{t('operations.fx.col.book_amount')}</TableHead>
                      <TableHead className="text-end">{t('operations.fx.col.revalued_amount')}</TableHead>
                      <TableHead className="text-end">{t('operations.fx.col.fx_gain_loss')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fxLines.map((ln, i) => (
                      <TableRow key={i}>
                        <TableCell className="num-latin">{ln.code ?? `#${ln.account_id}`}</TableCell>
                        <TableCell>{ln.name ?? '—'}</TableCell>
                        <TableCell className="text-end tabular-nums num-latin">{formatMoney(ln.book_amount)}</TableCell>
                        <TableCell className="text-end tabular-nums num-latin">{formatMoney(ln.revalued_amount)}</TableCell>
                        <TableCell className="text-end tabular-nums num-latin">{formatMoney(ln.fx_gain_loss)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : fxPreview.data && fxLines.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('operations.fx.no_adjustments')}</p>
            ) : null}
          </SectionCard>
        </TabsContent>

        <TabsContent value="production" className="mt-4">
          <SectionCard title={t('operations.production.title')}>
            <div className="grid gap-3 md:grid-cols-2">
              {(boms.data ?? []).map((bom) => (
                <div key={String(bom.id)} className="rounded-xl border bg-background p-3">
                  <p className="font-medium">{String(bom.name ?? 'BoM')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('operations.production.product_label')} #{String(bom.finished_product_id ?? '—')} ·{' '}
                    {t('operations.production.version_label')} {String(bom.version ?? '—')}
                  </p>
                </div>
              ))}
              {!boms.isLoading && !boms.data?.length ? (
                <p className="text-sm text-muted-foreground">{t('operations.production.empty')}</p>
              ) : null}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

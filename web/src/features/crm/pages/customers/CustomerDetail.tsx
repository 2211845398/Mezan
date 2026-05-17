import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
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
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { OpenItemRead } from '@/features/accounting/api';
import ArApplyPaymentDrawer from '@/features/accounting/pages/ar/ArApplyPaymentDrawer';
import { arOpenItemsQueryOptions } from '@/features/accounting/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { formatCurrency, formatDate } from '@/lib/format';
import { formatPersonName } from '@/lib/personName';
import { cn } from '@/lib/utils';

import type { CustomerSalesInvoiceListResponse, LedgerEntryRead } from '../../api';
import { updateCustomer } from '../../api';
import {
  crmKeys,
  customerDetailQueryOptions,
  customerInvoicesQueryOptions,
  customerPerformanceQueryOptions,
  loyaltyLedgerQueryOptions,
} from '../../queries';
import ManualAdjustmentDrawer from './ManualAdjustmentDrawer';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const cid = id ? Number(id) : NaN;
  const { t, i18n } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const activeBranchId = useAuthStore((s) => s.activeBranchId ?? s.user?.branch_id ?? null);
  const [adjOpen, setAdjOpen] = useState(false);
  const [arPayOpen, setArPayOpen] = useState(false);
  const canEdit = usePermission('customers', 'update');
  const canAdjust = usePermission('loyalty', 'adjust');
  const canReadLoyalty = usePermission('loyalty', 'read');
  const canReadAccounting = usePermission('accounting', 'read');
  const canApplyAr = usePermission('accounting', 'update');

  const { data: customer, isLoading, refetch } = useQuery({
    ...customerDetailQueryOptions(cid),
    enabled: !Number.isNaN(cid) && cid > 0,
  });

  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileFatherName, setProfileFatherName] = useState('');
  const [profileFamilyName, setProfileFamilyName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileActive, setProfileActive] = useState(true);

  useEffect(() => {
    if (!customer) return;
    setProfileFirstName(customer.first_name ?? '');
    setProfileFatherName(customer.father_name ?? '');
    setProfileFamilyName(customer.family_name ?? '');
    setProfileEmail(customer.email ?? '');
    setProfileActive(customer.is_active);
  }, [customer]);

  const saveProfile = useMutation({
    mutationFn: () =>
      updateCustomer(cid, {
        first_name: profileFirstName.trim() || null,
        father_name: profileFatherName.trim() || null,
        family_name: profileFamilyName.trim() || null,
        email: profileEmail.trim() || null,
        is_active: profileActive,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.customer(cid) });
      toast.success(t('customers.saved'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const invArgs = { limit: 50, offset: 0 };
  const { data: invData, isLoading: invLoading } = useQuery({
    ...customerInvoicesQueryOptions(cid, invArgs),
    enabled: !Number.isNaN(cid) && cid > 0,
  });

  const { data: ledger = [], isLoading: ledLoading } = useQuery({
    ...loyaltyLedgerQueryOptions(cid, { limit: 50, offset: 0 }),
    enabled: !Number.isNaN(cid) && cid > 0 && canReadLoyalty,
  });
  const { data: performance, isLoading: perfLoading } = useQuery({
    ...customerPerformanceQueryOptions(cid, 365),
    enabled: !Number.isNaN(cid) && cid > 0,
  });

  const { data: arItems = [], isLoading: arLoading } = useQuery({
    ...arOpenItemsQueryOptions({
      branch_id: activeBranchId ?? undefined,
      status: 'open',
    }),
    enabled:
      !Number.isNaN(cid) &&
      cid > 0 &&
      canReadAccounting &&
      activeBranchId != null &&
      activeBranchId > 0,
  });

  const customerOpenItems: OpenItemRead[] = useMemo(
    () =>
      arItems.filter(
        (i) => i.customer_id === cid && Number.parseFloat(String(i.amount_open)) > 0,
      ),
    [arItems, cid],
  );

  const onArApplied = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: crmKeys.customer(cid) });
    await qc.invalidateQueries({ queryKey: crmKeys.customerPerformance(cid, 365) });
    await qc.invalidateQueries({ queryKey: crmKeys.customerInvoices(cid, invArgs) });
  }, [qc, cid, invArgs]);

  const invRows = (invData as CustomerSalesInvoiceListResponse | undefined)?.items ?? [];

  const invColumns = useMemo(
    () =>
      defineColumns<(typeof invRows)[0]>()([
        { id: 'no', accessorKey: 'invoice_number', header: t('customers.invoice_no') },
        { id: 'tot', accessorKey: 'total', header: t('customers.invoice_total') },
        {
          id: 'dt',
          accessorKey: 'created_at',
          header: t('customers.invoice_date'),
          cell: ({ getValue }) => {
            const v = getValue() as string | null | undefined;
            if (!v) return '';
            return (
              <span dir="ltr" className="tabular-nums">
                {formatDate(v, 'dd-MM-yyyy')}
              </span>
            );
          },
        },
      ]),
    [t],
  );

  const ledColumns = useMemo(
    () =>
      defineColumns<LedgerEntryRead>()([
        {
          id: 't',
          accessorKey: 'created_at',
          header: t('loyalty.ledger.when'),
          cell: ({ getValue }) => {
            const v = getValue() as string | null | undefined;
            if (!v) return '';
            return (
              <span dir="ltr" className="tabular-nums">
                {formatDate(v, 'dd-MM-yyyy')}
              </span>
            );
          },
        },
        { id: 'ty', accessorKey: 'entry_type', header: t('loyalty.ledger.type') },
        { id: 'pt', accessorKey: 'points', header: t('loyalty.ledger.points') },
        { id: 'bal', accessorKey: 'balance_after', header: t('loyalty.ledger.balance') },
        { id: 'rc', accessorKey: 'reason_code', header: t('loyalty.ledger.reason') },
      ]),
    [t],
  );

  if (Number.isNaN(cid)) return null;
  if (isLoading || !customer) return <div className="p-4">…</div>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('customers.detail_title')}
        subtitle={
          (() => {
            const dn = formatPersonName(customer.first_name, customer.father_name, customer.family_name);
            return dn ? `${dn} · ${customer.phone}` : customer.phone;
          })()
        }
        actions={
          <>
            {canAdjust ? (
              <Button type="button" onClick={() => setAdjOpen(true)}>
                {t('loyalty.adjust_points')}
              </Button>
            ) : null}
            <BackButton to="/crm/customers" label={t('customers.title')} />
          </>
        }
      />

      <Tabs defaultValue="performance" dir={i18n.dir()}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-md bg-muted p-1 text-muted-foreground">
          <TabsTrigger value="performance">{t('customers.tab_performance')}</TabsTrigger>
          <TabsTrigger value="profile">{t('customers.tab_profile')}</TabsTrigger>
          <TabsTrigger value="purchases">{t('customers.tab_purchases')}</TabsTrigger>
          {canReadLoyalty ? (
            <TabsTrigger value="loyalty">{t('customers.tab_loyalty')}</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          {/* Profile card: w-fit hugs content; fields use 32rem×1.05 ≈ 33.6rem; RTL aligns card to inline-start (right). */}
          <div className="flex w-full justify-start" dir={i18n.dir()}>
            <SectionCard className="w-full max-w-full overflow-visible sm:w-fit">
              <div className="w-full space-y-4 sm:w-[33.6rem] sm:max-w-[min(100%,33.6rem)]">
                <div className="grid w-full gap-1">
                  <Label className="text-start">{t('customers.phone')}</Label>
                  <Input
                    value={customer.phone}
                    readOnly
                    className={cn('w-full bg-muted/50', i18n.dir() === 'rtl' && 'text-end')}
                    dir="ltr"
                  />
                </div>
                <div className="grid w-full gap-1">
                  <Label htmlFor="prof-fn" className="text-start">
                    {t('customers.first_name')}
                  </Label>
                  <Input
                    id="prof-fn"
                    value={profileFirstName}
                    onChange={(e) => setProfileFirstName(e.target.value)}
                    disabled={!canEdit}
                    className="w-full text-start"
                  />
                </div>
                <div className="grid w-full gap-1">
                  <Label htmlFor="prof-father" className="text-start">
                    {t('customers.father_name')}
                  </Label>
                  <Input
                    id="prof-father"
                    value={profileFatherName}
                    onChange={(e) => setProfileFatherName(e.target.value)}
                    disabled={!canEdit}
                    className="w-full text-start"
                  />
                </div>
                <div className="grid w-full gap-1">
                  <Label htmlFor="prof-family" className="text-start">
                    {t('customers.family_name')}
                  </Label>
                  <Input
                    id="prof-family"
                    value={profileFamilyName}
                    onChange={(e) => setProfileFamilyName(e.target.value)}
                    disabled={!canEdit}
                    className="w-full text-start"
                  />
                </div>
                <div className="grid w-full gap-1">
                  <Label htmlFor="prof-email" className="text-start">
                    {t('customers.email')}
                  </Label>
                  <Input
                    id="prof-email"
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    disabled={!canEdit}
                    dir="ltr"
                    className={cn('w-full', i18n.dir() === 'rtl' && 'text-end')}
                  />
                </div>
                {canEdit ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid w-full gap-1" dir={i18n.dir()}>
                      <Label htmlFor="prof-status" className="text-start">
                        {t('customers.col.status')}
                      </Label>
                      <Select
                        value={profileActive ? 'true' : 'false'}
                        onValueChange={(v) => setProfileActive(v === 'true')}
                      >
                        <SelectTrigger
                          id="prof-status"
                          dir={i18n.dir()}
                          className={cn(
                            'w-full',
                            i18n.dir() === 'rtl' &&
                              'text-start [&>span]:block [&>span]:w-full [&>span]:min-w-0 [&>span]:text-start',
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir={i18n.dir()}>
                          <SelectItem value="true">{t('customers.active_label')}</SelectItem>
                          <SelectItem value="false">{t('customers.inactive_label')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      disabled={saveProfile.isPending}
                      onClick={() => void saveProfile.mutate()}
                      className="w-full sm:w-auto"
                    >
                      {tc('actions.save')}
                    </Button>
                  </div>
                ) : (
                  <div
                    className="inline-flex max-w-full flex-row items-center gap-2 overflow-visible rounded-md border p-3 text-sm"
                    dir={i18n.dir()}
                  >
                    <span className="shrink-0 text-start font-medium">
                      {profileActive ? t('customers.active_label') : t('customers.inactive_label')}
                    </span>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          {perfLoading || !performance ? (
            <div className="rounded-xl border p-6 text-sm text-muted-foreground">...</div>
          ) : (
            <div className="grid gap-4">
              <div
                className={cn(
                  'grid gap-3',
                  'md:grid-cols-4',
                  i18n.dir() === 'rtl' && 'md:[direction:rtl]',
                )}
              >
                {[
                  {
                    key: 'aov',
                    label: t('customers.metric_avg_cart'),
                    value: formatCurrency(Number(performance.metrics.average_order_value), 'USD'),
                  },
                  {
                    key: 'ltv',
                    label: t('customers.metric_total_spend'),
                    value: formatCurrency(Number(performance.metrics.lifetime_value), 'USD'),
                  },
                  {
                    key: 'debt',
                    label: t('customers.metric_open_debt'),
                    value: formatCurrency(Number(performance.metrics.open_debt), 'USD'),
                  },
                  {
                    key: 'pts',
                    label: t('customers.metric_loyalty_points'),
                    value: String(performance.metrics.loyalty_points_balance),
                  },
                ].map((metric) => (
                  <SectionCard key={metric.key} contentClassName="p-4">
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="mt-1 text-2xl font-semibold">{metric.value}</p>
                  </SectionCard>
                ))}
              </div>
              <SectionCard title={t('customers.top_products_title')}>
                <div className="space-y-3">
                  {performance.top_products.map((product) => (
                    <div
                      key={product.product_id}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 text-sm last:border-0 last:pb-0"
                    >
                      <span className="min-w-0 flex-1 font-medium">{product.product_name}</span>
                      <span className="text-muted-foreground">
                        {t('customers.top_product_qty', { qty: product.total_qty })}
                      </span>
                      <span className="tabular-nums font-medium" dir="ltr">
                        {formatCurrency(Number(product.total_spend), 'USD')}
                      </span>
                    </div>
                  ))}
                  {!performance.top_products.length ? (
                    <p className="text-sm text-muted-foreground">{t('customers.top_products_empty')}</p>
                  ) : null}
                </div>
              </SectionCard>

              {canReadAccounting ? (
                <SectionCard title={t('customers.ar_open_title')}>
                  <p className="mb-3 text-sm text-muted-foreground">{t('customers.ar_open_hint')}</p>
                  {!activeBranchId ? (
                    <p className="text-sm text-muted-foreground">{t('customers.ar_no_branch')}</p>
                  ) : arLoading ? (
                    <p className="text-sm text-muted-foreground">{t('customers.ar_loading')}</p>
                  ) : customerOpenItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('customers.ar_empty')}</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-md border" dir={i18n.dir()}>
                        <Table>
                        <TableBody>
                          {customerOpenItems.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="max-w-[65%]">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {t('customers.ar_doc')}
                                </p>
                                <span className="font-mono text-sm" dir="ltr">
                                  {row.source_id}
                                </span>
                                {row.description ? (
                                  <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-end align-top">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {t('customers.ar_open_amount')}
                                </p>
                                <p className="mt-1 font-semibold">
                                  {formatCurrency(
                                    Number(row.amount_open),
                                    row.currency_code || 'USD',
                                  )}
                                </p>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                      {canApplyAr ? (
                        <Button type="button" className="mt-4" onClick={() => setArPayOpen(true)}>
                          {t('customers.ar_collect')}
                        </Button>
                      ) : null}
                    </>
                  )}
                </SectionCard>
              ) : null}
            </div>
          )}
        </TabsContent>
        <TabsContent value="purchases" className="mt-4">
          <DataTable
            mode="client"
            columns={invColumns}
            data={invRows}
            isLoading={invLoading}
            isError={false}
            onRetry={() => void refetch()}
            tableDir={i18n.dir() === 'rtl' ? 'rtl' : 'ltr'}
          />
        </TabsContent>
        {canReadLoyalty ? (
          <TabsContent value="loyalty" className="mt-4">
            <DataTable
              mode="client"
              columns={ledColumns}
              data={ledger}
              isLoading={ledLoading}
              isError={false}
              onRetry={() => void refetch()}
              tableDir={i18n.dir() === 'rtl' ? 'rtl' : 'ltr'}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      <ManualAdjustmentDrawer open={adjOpen} onOpenChange={setAdjOpen} customerId={cid} />

      <ArApplyPaymentDrawer
        open={arPayOpen}
        onOpenChange={setArPayOpen}
        items={customerOpenItems}
        onApplied={onArApplied}
      />
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';
import { formatCurrency } from '@/lib/format';

import type { CustomerSalesInvoiceListResponse, LedgerEntryRead } from '../../api';
import {
  customerDetailQueryOptions,
  customerInvoicesQueryOptions,
  customerPerformanceQueryOptions,
  loyaltyLedgerQueryOptions,
} from '../../queries';
import ManualAdjustmentDrawer from './ManualAdjustmentDrawer';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const cid = id ? Number(id) : NaN;
  const { t } = useTranslation('crm');
  const [adjOpen, setAdjOpen] = useState(false);
  const canEdit = usePermission('customers', 'update');
  const canAdjust = usePermission('loyalty', 'adjust');
  const canReadLoyalty = usePermission('loyalty', 'read');

  const { data: customer, isLoading, refetch } = useQuery({
    ...customerDetailQueryOptions(cid),
    enabled: !Number.isNaN(cid) && cid > 0,
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

  const invRows = (invData as CustomerSalesInvoiceListResponse | undefined)?.items ?? [];

  const invColumns = useMemo(
    () =>
      defineColumns<(typeof invRows)[0]>()([
        { id: 'no', accessorKey: 'invoice_number', header: t('customers.invoice_no') },
        { id: 'tot', accessorKey: 'total', header: t('customers.invoice_total') },
        { id: 'dt', accessorKey: 'created_at', header: t('customers.invoice_date') },
      ]),
    [t],
  );

  const ledColumns = useMemo(
    () =>
      defineColumns<LedgerEntryRead>()([
        { id: 't', accessorKey: 'created_at', header: t('loyalty.ledger.when') },
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
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{customer.full_name || customer.phone}</h1>
        <div className="flex flex-wrap gap-2">
          {canAdjust ? (
            <Button type="button" onClick={() => setAdjOpen(true)}>
              {t('loyalty.adjust_points')}
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link to={`/crm/customers/${cid}/edit`}>{t('customers.edit')}</Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link to="/crm/customers">{t('customers.back_list')}</Link>
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('customers.profile_line', {
          phone: customer.phone,
          email: customer.email ?? '—',
          points: customer.loyalty_balance,
          spend: customer.lifetime_spend,
        })}
      </p>

      <Tabs defaultValue="performance">
        <TabsList>
          <TabsTrigger value="performance">الأداء</TabsTrigger>
          <TabsTrigger value="profile">{t('customers.tab_profile')}</TabsTrigger>
          <TabsTrigger value="purchases">{t('customers.tab_purchases')}</TabsTrigger>
          {canReadLoyalty ? (
            <TabsTrigger value="loyalty">{t('customers.tab_loyalty')}</TabsTrigger>
          ) : null}
          <TabsTrigger value="addresses">{t('customers.tab_addresses')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <Table>
            <TableBody>
              <TableRow>
                <TableHead className="w-[180px]">{t('customers.phone')}</TableHead>
                <TableCell>{customer.phone}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>{t('customers.full_name')}</TableHead>
                <TableCell>{customer.full_name ?? '—'}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>{t('customers.email')}</TableHead>
                <TableCell>{customer.email ?? '—'}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>{t('customers.temporary')}</TableHead>
                <TableCell>{customer.is_temporary ? t('customers.yes') : t('customers.no')}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          {perfLoading || !performance ? (
            <div className="rounded-xl border p-6 text-sm text-muted-foreground">...</div>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  {
                    label: 'متوسط السلة',
                    value: formatCurrency(Number(performance.metrics.average_order_value), 'USD'),
                  },
                  {
                    label: 'قيمة العميل',
                    value: formatCurrency(Number(performance.metrics.lifetime_value), 'USD'),
                  },
                  { label: 'عدد المشتريات', value: String(performance.metrics.purchase_count) },
                  {
                    label: 'ديون مفتوحة',
                    value: formatCurrency(Number(performance.metrics.open_debt), 'USD'),
                  },
                ].map((metric) => (
                  <SectionCard key={metric.label} contentClassName="p-4">
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="mt-1 text-2xl font-semibold">{metric.value}</p>
                  </SectionCard>
                ))}
              </div>
              <SectionCard title="أفضل المنتجات">
                <div className="space-y-3">
                  {performance.top_products.map((product) => {
                    const max = Math.max(
                      ...performance.top_products.map((item) => Number(item.total_spend) || 0),
                      1,
                    );
                    const width = `${Math.round(((Number(product.total_spend) || 0) / max) * 100)}%`;
                    return (
                      <div key={product.product_id} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{product.product_name}</span>
                          <span className="text-muted-foreground">
                            {product.total_qty} × {formatCurrency(Number(product.total_spend), 'USD')}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width }} />
                        </div>
                      </div>
                    );
                  })}
                  {!performance.top_products.length ? (
                    <p className="text-sm text-muted-foreground">لا توجد مشتريات كافية بعد.</p>
                  ) : null}
                </div>
              </SectionCard>
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
            />
          </TabsContent>
        ) : null}
        <TabsContent value="addresses" className="mt-4 text-sm text-muted-foreground">
          {t('customers.addresses_placeholder')}
        </TabsContent>
      </Tabs>

      <ManualAdjustmentDrawer open={adjOpen} onOpenChange={setAdjOpen} customerId={cid} />
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { formatPersonName } from '@/lib/personName';

import type { CustomerListItemRead } from '../../api';
import { customersListQueryOptions } from '../../queries';
import CustomerForm from './CustomerForm';

export default function CustomersList() {
  const { t, i18n } = useTranslation('crm');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(0);
  const [activation, setActivation] = useState<'all' | 'pending'>('all');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const pageSize = 30;
  const canCreate = usePermission('customers', 'create');
  const listArgs = useMemo(() => {
    const p: { limit: number; offset: number; search?: string; activation: 'all' | 'pending' } = {
      limit: pageSize,
      offset: page * pageSize,
      activation,
    };
    if (applied.trim()) p.search = applied.trim();
    return p;
  }, [applied, page, pageSize, activation]);
  const { data, isLoading, isError, refetch } = useQuery(customersListQueryOptions(listArgs));
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo(
    () =>
      defineColumns<CustomerListItemRead>()([
        {
          id: 'n',
          header: t('customers.col.name'),
          cell: ({ row }) => formatPersonName(row.original.first_name, row.original.father_name, row.original.family_name) || '—',
        },
        { id: 'p', accessorKey: 'phone', header: t('customers.col.phone') },
        { id: 'e', accessorKey: 'email', header: t('customers.col.email'), cell: ({ row }) => row.original.email ?? '—' },
        {
          id: 'lb',
          header: t('customers.col.loyalty'),
          cell: ({ row }) => String(row.original.loyalty_balance),
        },
        {
          id: 'sp',
          header: t('customers.col.lifetime'),
          cell: ({ row }) => String(row.original.lifetime_spend),
        },
        {
          id: 'st',
          header: t('customers.col.status'),
          cell: ({ row }) =>
            row.original.is_active ? (
              <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:text-emerald-100">
                {t('customers.status.active')}
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-950 dark:text-amber-100">
                {t('customers.status.pending')}
              </span>
            ),
        },
        {
          id: 'a',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="icon" variant="ghost" asChild>
              <Link to={`/crm/customers/${row.original.id}`} aria-label={t('customers.view')}>
                <Eye className="size-4" />
              </Link>
            </Button>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('customers.title')} />
      <div
        className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4"
        dir={i18n.dir()}
      >
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md">
            <Label htmlFor="cust-search">{t('customers.search')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="cust-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('customers.search_placeholder')}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                className="h-10 shrink-0"
                onClick={() => {
                  setApplied(search.trim());
                  setPage(0);
                  void refetch();
                }}
              >
                {t('customers.search_submit')}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <div
              className={cn(
                'inline-flex h-10 items-stretch gap-1 rounded-lg border border-border/80 bg-background p-1 shadow-inner',
                'ring-offset-background',
              )}
              role="group"
              aria-label={t('customers.filter_segment_label')}
            >
              <Button
                type="button"
                variant={activation === 'all' ? 'default' : 'ghost'}
                className="h-full min-h-0 shrink-0 rounded-md px-3 py-0 shadow-none"
                onClick={() => {
                  setActivation('all');
                  setPage(0);
                }}
              >
                {t('customers.filter_all')}
              </Button>
              <Button
                type="button"
                variant={activation === 'pending' ? 'default' : 'ghost'}
                className="h-full min-h-0 shrink-0 rounded-md px-3 py-0 shadow-none"
                onClick={() => {
                  setActivation('pending');
                  setPage(0);
                }}
              >
                {t('customers.filter_pending')}
              </Button>
            </div>
            {canCreate ? (
              <Button
                type="button"
                className="h-10 shrink-0"
                onClick={() => {
                  setFormKey((k) => k + 1);
                  setNewCustomerOpen(true);
                }}
              >
                {t('customers.new')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t('customers.total', { total })}</p>
      <DataTable
        mode="client"
        showSearch={false}
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        tableDir={i18n.dir() === 'rtl' ? 'rtl' : 'ltr'}
      />
      {total > pageSize ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t('customers.prev')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('customers.next')}
          </Button>
        </div>
      ) : null}

      <FloatingFormDialog
        open={newCustomerOpen}
        onOpenChange={setNewCustomerOpen}
        title={t('customers.new')}
        maxWidth="lg"
      >
        {newCustomerOpen ? (
          <CustomerForm key={formKey} variant="dialog" onDismiss={() => setNewCustomerOpen(false)} />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

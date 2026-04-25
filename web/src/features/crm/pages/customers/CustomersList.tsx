import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';

import type { CustomerListItemRead } from '../../api';
import { customersListQueryOptions } from '../../queries';

export default function CustomersList() {
  const { t } = useTranslation('crm');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 30;
  const canCreate = usePermission('customers', 'create');
  const listArgs = useMemo(() => {
    const p: { limit: number; offset: number; search?: string } = {
      limit: pageSize,
      offset: page * pageSize,
    };
    if (applied.trim()) p.search = applied.trim();
    return p;
  }, [applied, page, pageSize]);
  const { data, isLoading, isError, refetch } = useQuery(customersListQueryOptions(listArgs));
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo(
    () =>
      defineColumns<CustomerListItemRead>()([
        { id: 'n', header: t('customers.col.name'), cell: ({ row }) => row.original.full_name ?? '—' },
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
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('customers.title')}</h1>
        {canCreate ? (
          <Button asChild>
            <Link to="/crm/customers/new">{t('customers.new')}</Link>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('customers.search')}</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="w-[240px]" />
        </div>
        <Button
          type="button"
          onClick={() => {
            setApplied(search.trim());
            setPage(0);
            void refetch();
          }}
        >
          {t('customers.apply')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('customers.total', { total })}</p>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
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
    </div>
  );
}

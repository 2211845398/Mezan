import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import type { SupplierRead } from '../../api';
import { suppliersQueryOptions } from '../../queries';

export default function SuppliersList() {
  const { t } = useTranslation('purchasing');
  const canCreate = usePermission('suppliers', 'create');
  const canUpdate = usePermission('suppliers', 'update');
  const { data: rows = [], isLoading, isError, refetch } = useQuery(suppliersQueryOptions());

  const columns = useMemo(
    () =>
      defineColumns<SupplierRead>()([
        { id: 'code', accessorKey: 'code', header: t('suppliers.col.code') },
        { id: 'name', accessorKey: 'name', header: t('suppliers.col.name') },
        { id: 'currency_id', accessorKey: 'currency_id', header: t('suppliers.col.currency') },
        {
          id: 'tax_id',
          accessorKey: 'tax_id',
          header: t('suppliers.col.tax_id'),
          cell: ({ row }) => row.original.tax_id ?? '—',
        },
        {
          id: 'payment_terms',
          accessorKey: 'payment_terms',
          header: t('suppliers.col.payment_terms'),
          cell: ({ row }) => row.original.payment_terms ?? '—',
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            canUpdate ? (
              <Button type="button" size="icon" variant="ghost" asChild>
                <Link to={`/purchasing/suppliers/${row.original.id}/edit`} aria-label={t('suppliers.edit')}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            ) : null,
        },
      ]),
    [canUpdate, t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('suppliers.title')}</h1>
        {canCreate ? (
          <Button asChild>
            <Link to="/purchasing/suppliers/new">
              <Plus className="me-2 size-4" />
              {t('suppliers.new')}
            </Link>
          </Button>
        ) : null}
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}

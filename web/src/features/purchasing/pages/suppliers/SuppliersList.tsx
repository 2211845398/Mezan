import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatPersonName } from '@/lib/personName';

import type { SupplierRead } from '../../api';
import { suppliersQueryOptions } from '../../queries';
import SupplierForm from './SupplierForm';

export default function SuppliersList() {
  const { t } = useTranslation('purchasing');
  const canCreate = usePermission('suppliers', 'create');
  const canUpdate = usePermission('suppliers', 'update');
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplierFormKey, setNewSupplierFormKey] = useState(0);
  const { data: rows = [], isLoading, isError, refetch } = useQuery(suppliersQueryOptions());

  const columns = useMemo(
    () =>
      defineColumns<SupplierRead>()([
        { id: 'code', accessorKey: 'code', header: t('suppliers.col.code') },
        {
          id: 'name',
          accessorFn: (row) =>
            [formatPersonName(row.first_name, row.father_name, row.family_name), row.code].filter(Boolean).join(' '),
          header: t('suppliers.col.name'),
          cell: ({ row }) => formatPersonName(row.original.first_name, row.original.father_name, row.original.family_name) || '—',
        },
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
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('suppliers.title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canCreate ? (
              <Button
                type="button"
                onClick={() => {
                  setNewSupplierFormKey((k) => k + 1);
                  setNewSupplierOpen(true);
                }}
              >
                <Plus className="me-2 size-4" />
                {t('suppliers.new')}
              </Button>
            ) : null}
          </div>
        }
      />
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <FloatingFormDialog
        open={newSupplierOpen}
        onOpenChange={setNewSupplierOpen}
        title={t('suppliers.new')}
        maxWidth="lg"
      >
        {newSupplierOpen ? (
          <SupplierForm
            key={newSupplierFormKey}
            variant="dialog"
            onDismiss={() => setNewSupplierOpen(false)}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

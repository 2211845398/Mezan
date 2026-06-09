import { useQuery } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { paginatedParams } from '@/api/pagination';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
import {
  FloatingFormDialog,
  FloatingFormDialogFooter,
} from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { formatPersonName } from '@/lib/personName';

import { paymentTermsQueryOptions } from '@/features/accounting/queries';

import { supplierCurrencyLabel } from '../../lib/supplierCurrencyLabel';
import { supplierPaymentTermsLabel } from '../../lib/supplierPaymentTermsLabel';
import type { SupplierRead } from '../../api';
import { suppliersQueryOptions } from '../../queries';
import SupplierForm, { SUPPLIER_DIALOG_FORM_ID } from './SupplierForm';

export default function SuppliersList() {
  const { t, i18n } = useTranslation('purchasing');
  const { t: tc } = useTranslation('common');
  const isAr = i18n.language.startsWith('ar');
  const canCreate = usePermission('suppliers', 'create');
  const canRead = usePermission('suppliers', 'read');

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newDialogKey, setNewDialogKey] = useState(0);
  const [search, setSearch] = useState('');

  const [urlQuery] = useTableUrlState({ pageSize: 20 });
  const { limit, offset } = paginatedParams(urlQuery.page, urlQuery.pageSize);

  const { data, isLoading, isError, refetch } = useQuery(
    suppliersQueryOptions({ limit, offset }),
  );
  const { data: paymentTerms = [] } = useQuery(paymentTermsQueryOptions(false));

  const rows = data?.items ?? [];
  const totalRows = data?.total ?? 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const fullName = formatPersonName(r.first_name, r.father_name, r.family_name).toLowerCase();
      return r.code.toLowerCase().includes(q) || fullName.includes(q);
    });
  }, [rows, search]);

  const columns = useMemo(
    () =>
      defineColumns<SupplierRead>()([
        { id: 'code', accessorKey: 'code', header: t('suppliers.col.code') },
        {
          id: 'name',
          accessorFn: (row) =>
            [formatPersonName(row.first_name, row.father_name, row.family_name), row.code]
              .filter(Boolean)
              .join(' '),
          header: t('suppliers.col.name'),
          cell: ({ row }) => {
            const name =
              formatPersonName(
                row.original.first_name,
                row.original.father_name,
                row.original.family_name,
              ) || row.original.code;
            return <span className="font-medium">{name}</span>;
          },
        },
        {
          id: 'contact',
          header: t('suppliers.col.contact'),
          cell: ({ row }) => {
            const c = row.original.contact as Record<string, string | undefined> | undefined;
            const phone = c?.phone;
            const email = c?.email;
            return phone ?? email ?? '—';
          },
        },
        {
          id: 'currency',
          header: t('suppliers.col.currency'),
          cell: ({ row }) => supplierCurrencyLabel(row.original, t),
        },
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
          cell: ({ row }) => supplierPaymentTermsLabel(row.original, paymentTerms, isAr),
        },
        {
          id: 'actions',
          header: '',
          enableGlobalFilter: false,
          cell: ({ row }) =>
            canRead ? (
              <Button type="button" size="icon" variant="ghost" asChild>
                <Link
                  to={`/purchasing/suppliers/${row.original.id}`}
                  aria-label={t('suppliers.view')}
                >
                  <Eye className="size-4" />
                </Link>
              </Button>
            ) : null,
        },
      ]),
    [canRead, isAr, paymentTerms, t],
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title={t('suppliers.title')}
        actions={
          canCreate ? (
            <Button
              type="button"
              onClick={() => {
                setNewDialogKey((k) => k + 1);
                setNewDialogOpen(true);
              }}
            >
              <Plus className="me-2 size-4" />
              {t('suppliers.new')}
            </Button>
          ) : null
        }
      />

      <DataTable
        mode="server"
        columns={columns}
        data={filtered}
        totalRows={totalRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        showSearch={false}
        toolbarLeading={
          <div className="space-y-1.5">
            <Label htmlFor="sup-search">{t('suppliers.search_label')}</Label>
            <Input
              id="sup-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('suppliers.search_placeholder')}
            />
          </div>
        }
      />

      <FloatingFormDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        title={t('suppliers.new')}
        maxWidth="lg"
        footer={
          <FloatingFormDialogFooter
            formId={SUPPLIER_DIALOG_FORM_ID}
            onCancel={() => setNewDialogOpen(false)}
            saveLabel={t('suppliers.form.save')}
            cancelLabel={tc('actions.cancel')}
          />
        }
      >
        {newDialogOpen ? (
          <SupplierForm
            key={newDialogKey}
            variant="dialog"
            onDismiss={() => setNewDialogOpen(false)}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

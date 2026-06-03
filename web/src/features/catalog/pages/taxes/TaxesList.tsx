import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import type { TaxDefinitionRead } from '../../api';
import { listTaxDefinitions } from '../../api';
import { catalogKeys } from '../../queries';
import TaxForm from './TaxForm';

function formatRateFraction(rate: string): string {
  const n = Number.parseFloat(String(rate));
  if (!Number.isFinite(n)) {
    return '—';
  }
  return `${(n * 100).toFixed(2)}%`;
}

export default function TaxesList() {
  const { t } = useTranslation('catalog');
  const canCreate = usePermission('catalog', 'create');
  const canUpdate = usePermission('catalog', 'update');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [editing, setEditing] = useState<TaxDefinitionRead | null>(null);

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: catalogKeys.taxDefinitions(true),
    queryFn: () => listTaxDefinitions(true),
  });

  const columns = useMemo(
    () =>
      defineColumns<TaxDefinitionRead>()([
        { id: 'name', accessorKey: 'name', header: t('taxes.col.name') },
        {
          id: 'code',
          accessorKey: 'code',
          header: t('taxes.col.code'),
          cell: ({ row }) => row.original.code ?? '—',
        },
        {
          id: 'rate',
          accessorKey: 'rate',
          header: t('taxes.col.rate'),
          cell: ({ row }) => (
            <span className="num-latin">{formatRateFraction(String(row.original.rate))}</span>
          ),
        },
        {
          id: 'is_active',
          accessorKey: 'is_active',
          header: t('taxes.col.active'),
          cell: ({ row }) => (row.original.is_active ? t('taxes.status_yes') : t('taxes.status_no')),
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            canUpdate ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t('taxes.edit')}
                onClick={() => {
                  setEditing(row.original);
                  setDialogKey((k) => k + 1);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="size-4" />
              </Button>
            ) : null,
        },
      ]),
    [canUpdate, t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('taxes.title')}
        actions={
          canCreate ? (
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setDialogKey((k) => k + 1);
                setDialogOpen(true);
              }}
            >
              <Plus className="me-2 size-4" />
              {t('taxes.new')}
            </Button>
          ) : null
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
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) {
            setEditing(null);
          }
        }}
        title={editing ? t('taxes.edit') : t('taxes.new')}
        maxWidth="lg"
      >
        {dialogOpen ? (
          <TaxForm
            key={dialogKey}
            variant="dialog"
            existing={editing}
            onDismiss={() => {
              setDialogOpen(false);
              setEditing(null);
            }}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

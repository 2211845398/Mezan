import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';

import type { StockMovement } from '../../api';
import { useMovementsQuery } from '../../queries';
import AdjustmentForm from './AdjustmentForm';

export default function AdjustmentsList() {
  const { t } = useTranslation('inventory');
  const canCreate = usePermission('stock_adjustments', 'create');
  const { data: rows = [], isLoading, isError, refetch } = useMovementsQuery({ limit: 200, offset: 0 });
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementFormKey, setMovementFormKey] = useState(0);

  const columns = defineColumns<StockMovement>()([
    { id: 'id', accessorKey: 'id', header: t('adjustments.col.movement_no') },
    {
      id: 'branch',
      header: t('adjustments.col.branch'),
      cell: ({ row }) => row.original.branch_name ?? String(row.original.branch_id),
    },
    {
      id: 'product',
      header: t('adjustments.col.product'),
      cell: ({ row }) => row.original.product_name ?? String(row.original.product_id),
    },
    { id: 'delta', accessorKey: 'qty_delta', header: t('adjustments.col.delta') },
    {
      id: 'kind',
      header: t('adjustments.col.kind'),
      cell: ({ row }) => row.original.movement_kind ?? '—',
    },
    { id: 'reason', accessorKey: 'reason', header: t('adjustments.col.reason') },
    {
      id: 'at',
      accessorKey: 'created_at',
      header: t('adjustments.col.at'),
      cell: ({ row }) =>
        row.original.created_at ? formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm') : '—',
    },
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('adjustments.title')} />
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        toolbarExtras={
          canCreate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMovementFormKey((k) => k + 1);
                setMovementDialogOpen(true);
              }}
            >
              {t('adjustments.new')}
            </Button>
          ) : null
        }
      />

      <FloatingFormDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        title={t('adjustments.new')}
        maxWidth="lg"
      >
        {movementDialogOpen ? (
          <AdjustmentForm
            key={movementFormKey}
            variant="dialog"
            onDismiss={() => setMovementDialogOpen(false)}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

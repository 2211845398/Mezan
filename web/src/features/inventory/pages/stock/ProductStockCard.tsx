import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';

import { useStockCardQuery } from '../../queries';
import type { StockCardRead } from '../../types';

type BranchRow = StockCardRead['branches'][number];

export default function ProductStockCard() {
  const { productId: pid } = useParams<{ productId: string }>();
  const { t } = useTranslation('inventory');
  const id = pid ? Number(pid) : NaN;
  const { data, isLoading, isError, refetch } = useStockCardQuery(Number.isFinite(id) ? id : null);

  const cols = useMemo(
    () =>
      defineColumns<BranchRow>()([
        { id: 'b', header: t('stockCard.col.branch'), cell: ({ row }) => row.original.branch_name },
        { id: 'avail', accessorKey: 'available', header: t('stockCard.col.available') },
        { id: 'oh', accessorKey: 'on_hand', header: t('stockCard.col.on_hand') },
        { id: 'rsv', accessorKey: 'reserved', header: t('stockCard.col.reserved') },
        { id: 'dmg', accessorKey: 'damaged', header: t('stockCard.col.damaged') },
        { id: 'oo', accessorKey: 'on_order', header: t('stockCard.col.on_order') },
        { id: 'iti', accessorKey: 'in_transit_in', header: t('stockCard.col.in_transit_in') },
        { id: 'ito', accessorKey: 'in_transit_out', header: t('stockCard.col.in_transit_out') },
        { id: 'rp', accessorKey: 'reorder_point', header: t('stockCard.col.reorder_point') },
        { id: 'dc', header: t('stockCard.col.days_cover'), cell: ({ row }) => row.original.days_of_cover ?? '—' },
        {
          id: 'st',
          header: t('stockCard.col.status'),
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.reorder_status}
              label={t(`stock.reorder_status.${row.original.reorder_status}`, row.original.reorder_status)}
            />
          ),
        },
      ]),
    [t],
  );

  if (!Number.isFinite(id) || id <= 0) {
    return <p className="p-6 text-muted-foreground">{t('stockCard.invalid')}</p>;
  }

  if (isLoading || !data) {
    return <p className="p-6 text-muted-foreground">{t('loading')}</p>;
  }

  if (isError) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-destructive">{t('errors.generic')}</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          {t('actions.open')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={data.product_name}
        subtitle={`${data.sku} · ${data.category_name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <BackButton to="/inventory/stock" label={t('actions.back')} />
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to={`/catalog/products/${data.product_id}/edit`}>{t('stockCard.view_catalog')}</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/inventory/adjustments/new">{t('stock.action.movement')}</Link>
            </Button>
          </div>
        }
      />

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t('stockCard.branches')}</h2>
        <DataTable mode="client" columns={cols} data={data.branches} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t('stockCard.movements')}</h2>
        <ul className="space-y-2 text-sm">
          {data.recent_movements.map((m) => (
            <li key={m.id} className="rounded border bg-card p-2">
              <span className="font-mono text-xs text-muted-foreground">#{m.id}</span>{' '}
              {m.reason} · Δ{m.qty_delta}
              {m.movement_kind ? ` · ${m.movement_kind}` : ''}
              <span className="block text-xs text-muted-foreground">{String(m.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

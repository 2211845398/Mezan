import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  InventoryListHeader,
  InventoryProductSearchField,
} from '../../components/InventoryListHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { newIdempotencyKey } from '@/lib/idempotency';

import { listReservations, postReleaseReservation, type ReservationRead } from '../../api';
import { inventoryKeys } from '../../queries';

export default function ReservationsListPage() {
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const { data: rows = [], isLoading, refetch, isError } = useQuery({
    queryKey: [...inventoryKeys.root, 'reservations'],
    queryFn: () => listReservations({ limit: 200 }),
  });

  const [releaseRow, setReleaseRow] = useState<ReservationRead | null>(null);
  const [releaseQty, setReleaseQty] = useState('');
  const [searchDraft, setSearchDraft] = useState('');

  const filteredRows = useMemo(() => {
    const q = searchDraft.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        String(r.movement_id),
        r.product_name,
        r.variant_name,
        r.reference_code,
        r.branch_name,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchDraft]);

  const releaseM = useMutation({
    mutationFn: async () => {
      if (!releaseRow) throw new Error('row');
      const q = Number(releaseQty);
      if (!Number.isFinite(q) || q <= 0) throw new Error('qty');
      return postReleaseReservation(releaseRow.movement_id, {
        idempotency_key: newIdempotencyKey(),
        quantity: q,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('movement.reserve.released'));
      setReleaseRow(null);
      setReleaseQty('');
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const columns = useMemo(
    () =>
      defineColumns<ReservationRead>()([
        {
          id: 'movement_id',
          accessorKey: 'movement_id',
          header: t('adjustments.col.movement_no'),
          cell: ({ row }) => (
            <span className="tabular-nums num-latin font-medium">{row.original.movement_id}</span>
          ),
        },
        { id: 'branch', header: t('stock.col.branch'), cell: ({ row }) => row.original.branch_name },
        { id: 'product', header: t('stock.col.product'), cell: ({ row }) => row.original.product_name },
        { id: 'variant', header: t('stock.col.variant_name'), cell: ({ row }) => row.original.variant_name },
        {
          id: 'ref',
          header: t('stock.col.reference_code'),
          cell: ({ row }) => row.original.reference_code || '—',
        },
        { id: 'open', accessorKey: 'qty_open', header: t('movement.reserve.open_qty') },
        { id: 'reserved', accessorKey: 'qty_reserved', header: t('movement.reserve.reserved_qty') },
        {
          id: 'source',
          header: t('movement.reserve.source'),
          cell: ({ row }) => {
            const r = row.original;
            const isTransfer = r.movement_kind === 'transfer_reserve';
            return (
              <div className="flex flex-col gap-0.5 text-sm">
                <span>{isTransfer ? t('movement.reserve.source_transfer') : t('movement.reserve.source_manual')}</span>
                {isTransfer && r.transfer_batch_id != null ? (
                  <Link
                    to={`/inventory/transfers/${r.transfer_batch_id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {t('movement.reserve.transfer_link', { batchId: r.transfer_batch_id })}
                  </Link>
                ) : null}
              </div>
            );
          },
        },
        {
          id: 'a',
          header: '',
          cell: ({ row }) => {
            const r = row.original;
            if (r.releasable === false) {
              return (
                <span className="text-xs text-muted-foreground" title={t('movement.reserve.transfer_hint')}>
                  {t('movement.reserve.transfer_hint')}
                </span>
              );
            }
            return (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setReleaseRow(r);
                setReleaseQty(String(r.qty_open));
              }}
            >
              {t('movement.reserve.release')}
            </Button>
            );
          },
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <InventoryListHeader
        title={t('movement.reserve.list_title')}
        actions={
          <>
            <Button type="button" size="sm" asChild>
              <Link to="/inventory/reservations/new">{t('movement.reserve.new')}</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/inventory/stock">{t('actions.back')}</Link>
            </Button>
          </>
        }
      />
      <DataTable
        mode="client"
        showSearch={false}
        toolbarLeading={
          <InventoryProductSearchField
            searchId="reserve-search"
            searchLabel={t('stock.search.label')}
            searchPlaceholder={t('stock.search.placeholder')}
            searchValue={searchDraft}
            onSearchChange={setSearchDraft}
          />
        }
        columns={columns}
        data={filteredRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        getRowId={(r) => String(r.movement_id)}
      />

      <Dialog open={releaseRow != null} onOpenChange={(o) => !o && setReleaseRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('movement.reserve.release_title')}</DialogTitle>
          </DialogHeader>
          {releaseRow ? (
            <p className="text-sm text-muted-foreground">
              {releaseRow.product_name} — {releaseRow.variant_name} ({t('movement.reserve.open_qty')}:{' '}
              {releaseRow.qty_open})
            </p>
          ) : null}
          <div>
            <Label>{t('movement.reserve.release_qty')}</Label>
            <Input
              type="number"
              min={1}
              max={releaseRow?.qty_open}
              value={releaseQty}
              onChange={(e) => setReleaseQty(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setReleaseRow(null)}>
              {t('actions.cancel')}
            </Button>
            <Button type="button" disabled={releaseM.isPending} onClick={() => void releaseM.mutate()}>
              {t('movement.reserve.release_confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

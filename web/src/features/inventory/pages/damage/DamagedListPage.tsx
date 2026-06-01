import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
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

import {
  InventoryListHeader,
  InventoryProductSearchField,
} from '../../components/InventoryListHeader';
import {
  listDamagedPositions,
  postScrapDamaged,
  postUnmarkDamaged,
  type DamagedPositionRead,
} from '../../api';
import { inventoryKeys } from '../../queries';
import { formatMovementReason } from '../../utils/movementLabels';

type ActionKind = 'scrap' | 'unmark';

export default function DamagedListPage() {
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const { data: rows = [], isLoading, refetch, isError } = useQuery({
    queryKey: [...inventoryKeys.root, 'damaged'],
    queryFn: () => listDamagedPositions({ limit: 200 }),
  });

  const [actionRow, setActionRow] = useState<DamagedPositionRead | null>(null);
  const [actionKind, setActionKind] = useState<ActionKind | null>(null);
  const [actionQty, setActionQty] = useState('');
  const [searchDraft, setSearchDraft] = useState('');

  const filteredRows = useMemo(() => {
    const q = searchDraft.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.movement_id != null ? String(r.movement_id) : '',
        r.product_name,
        r.variant_name,
        r.reference_code,
        r.branch_name,
        r.reason,
        String(r.product_id),
        String(r.variant_id),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchDraft]);

  const openAction = (row: DamagedPositionRead, kind: ActionKind) => {
    setActionRow(row);
    setActionKind(kind);
    setActionQty(String(row.qty_damaged));
  };

  const closeAction = () => {
    setActionRow(null);
    setActionKind(null);
    setActionQty('');
  };

  const actionM = useMutation({
    mutationFn: async () => {
      if (!actionRow || !actionKind) throw new Error('row');
      const q = Number(actionQty);
      if (!Number.isFinite(q) || q <= 0) throw new Error('qty');
      const body = {
        idempotency_key: newIdempotencyKey(),
        branch_id: actionRow.branch_id,
        product_id: actionRow.product_id,
        variant_id: actionRow.variant_id,
        quantity: q,
      };
      if (actionKind === 'scrap') {
        return postScrapDamaged(body);
      }
      return postUnmarkDamaged(body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(
        actionKind === 'scrap' ? t('movement.damage.scrapped') : t('movement.damage.unmarked'),
      );
      closeAction();
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const columns = useMemo(
    () =>
      defineColumns<DamagedPositionRead>()([
        {
          id: 'movement_id',
          accessorKey: 'movement_id',
          header: t('adjustments.col.movement_no'),
          cell: ({ row }) => (
            <span className="tabular-nums num-latin font-medium">
              {row.original.movement_id ?? '—'}
            </span>
          ),
        },
        { id: 'branch', header: t('stock.col.branch'), cell: ({ row }) => row.original.branch_name },
        { id: 'product', header: t('stock.col.product'), cell: ({ row }) => row.original.product_name },
        { id: 'variant', header: t('stock.col.variant_name'), cell: ({ row }) => row.original.variant_name },
        {
          id: 'ref',
          header: t('stock.col.reference_code'),
          cell: ({ row }) => row.original.reference_code?.trim() || '—',
        },
        { id: 'qty', accessorKey: 'qty_damaged', header: t('movement.damage.qty_damaged') },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openAction(row.original, 'unmark')}
              >
                {t('movement.damage.unmark')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => openAction(row.original, 'scrap')}
              >
                {t('movement.damage.scrap')}
              </Button>
            </div>
          ),
        },
        {
          id: 'reason',
          header: t('adjustments.col.reason'),
          cell: ({ row }) => formatMovementReason(row.original.reason, t),
        },
      ]),
    [t],
  );

  const dialogTitle =
    actionKind === 'scrap'
      ? t('movement.damage.scrap_title')
      : actionKind === 'unmark'
        ? t('movement.damage.unmark_title')
        : '';

  return (
    <div className="flex flex-col gap-6 p-6">
      <InventoryListHeader
        title={t('movement.damage.list_title')}
        actions={
          <>
            <Button type="button" size="sm" asChild>
              <Link to="/inventory/damage/new">{t('movement.damage.new')}</Link>
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
            searchId="damage-search"
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
        getRowId={(r) => `${r.branch_id}-${r.product_id}-${r.variant_id}`}
      />

      <Dialog open={actionRow != null} onOpenChange={(o) => !o && closeAction()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          {actionRow ? (
            <p className="text-sm text-muted-foreground">
              {actionRow.product_name} — {actionRow.variant_name} ({t('movement.damage.qty_damaged')}:{' '}
              {actionRow.qty_damaged})
            </p>
          ) : null}
          <div>
            <Label>{t('movement.damage.action_qty')}</Label>
            <Input
              type="number"
              min={1}
              max={actionRow?.qty_damaged}
              value={actionQty}
              onChange={(e) => setActionQty(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeAction}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant={actionKind === 'scrap' ? 'destructive' : 'default'}
              disabled={actionM.isPending}
              onClick={() => void actionM.mutate()}
            >
              {actionKind === 'scrap'
                ? t('movement.damage.scrap_confirm')
                : t('movement.damage.unmark_confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

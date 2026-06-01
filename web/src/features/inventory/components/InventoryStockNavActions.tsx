import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { floatingFormCloseButtonSmClassName } from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { purchasingKeys } from '@/features/purchasing/queries';
import { usePermission } from '@/hooks/usePermission';

import { postCreatePurchaseOrdersFromReorder } from '../api';
import { inventoryKeys } from '../queries';

export type InventoryStockNavActionsProps = {
  onOpenMovementDialog?: () => void;
  /** Extra actions after nav links (e.g. primary "new movement" on adjustments page). */
  trailing?: ReactNode;
};

export function InventoryStockNavActions({ onOpenMovementDialog, trailing }: InventoryStockNavActionsProps) {
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const canCreatePo = usePermission('purchase_orders', 'create');
  const canRecordMovement = usePermission('stock_adjustments', 'create');
  const canCreateTransfer = usePermission('inventory', 'update');

  const createPoM = useMutation({
    mutationFn: () => postCreatePurchaseOrdersFromReorder({}),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(t('stock.po_created', { count: res.created.length }));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <>
      {canRecordMovement ? (
        <>
          <Button type="button" size="sm" className={floatingFormCloseButtonSmClassName} asChild>
            <Link to="/inventory/receipts/new">{t('movement.receipt.short')}</Link>
          </Button>
          <Button type="button" size="sm" className={floatingFormCloseButtonSmClassName} asChild>
            <Link to="/inventory/reservations">{t('movement.reserve.short')}</Link>
          </Button>
          <Button type="button" size="sm" className={floatingFormCloseButtonSmClassName} asChild>
            <Link to="/inventory/damage">{t('movement.damage.short')}</Link>
          </Button>
          <Button type="button" size="sm" className={floatingFormCloseButtonSmClassName} asChild>
            <Link to="/inventory/stock-count">{t('movement.stock_count.short')}</Link>
          </Button>
          {onOpenMovementDialog ? (
            <Button
              type="button"
              size="sm"
              className={floatingFormCloseButtonSmClassName}
              onClick={onOpenMovementDialog}
            >
              {t('stock.action.movement')}
            </Button>
          ) : null}
        </>
      ) : null}
      {canCreateTransfer ? (
        <Button type="button" size="sm" className={floatingFormCloseButtonSmClassName} asChild>
          <Link to="/inventory/transfers/new">{t('stock.action.transfer')}</Link>
        </Button>
      ) : null}
      {canCreatePo ? (
        <Button
          type="button"
          size="sm"
          disabled={createPoM.isPending}
          onClick={() => void createPoM.mutate()}
        >
          {t('stock.action.create_po_alerts')}
        </Button>
      ) : null}
      {trailing}
    </>
  );
}

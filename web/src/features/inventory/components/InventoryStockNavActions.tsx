import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { floatingFormCloseButtonSmClassName } from '@/components/shared/FloatingFormDialog';
import { NavAttentionBadge } from '@/components/layout/NavAttentionBadge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { purchasingKeys } from '@/features/purchasing/queries';
import { navBadgeCount, useNavBadges } from '@/hooks/useNavBadges';
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
  const badges = useNavBadges();
  const reorderCount = navBadgeCount(badges, 'reorder_alerts');
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

  const poButton = (
    <Button
      type="button"
      size="sm"
      disabled={createPoM.isPending || reorderCount <= 0}
      onClick={() => void createPoM.mutate()}
    >
      <span className="flex items-center gap-1.5">
        {t('stock.action.create_po_alerts')}
        <NavAttentionBadge count={reorderCount} kind="reorder_alerts" />
      </span>
    </Button>
  );

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
        reorderCount <= 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{poButton}</span>
            </TooltipTrigger>
            <TooltipContent>{t('stock.action.create_po_alerts_empty')}</TooltipContent>
          </Tooltip>
        ) : (
          poButton
        )
      ) : null}
      {trailing}
    </>
  );
}

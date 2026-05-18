import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BranchRead } from '@/features/admin/types';

import GoodsReceiptFields from '../../components/GoodsReceiptFields';
import type { GoodsReceiptRead, PurchaseOrderRead } from '../../api';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrderRead;
  receipts: GoodsReceiptRead[];
  branches: BranchRead[];
  productLabels: Record<number, string>;
  onPosted?: () => void | Promise<void>;
};

/** Legacy dialog wrapper; prefer `/purchasing/orders/:id/receive` page. */
export default function GoodsReceiptForm({
  open,
  onOpenChange,
  purchaseOrder,
  receipts,
  branches,
  productLabels,
  onPosted,
}: Props) {
  const { t } = useTranslation('purchasing');
  const { t: tCommon } = useTranslation('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('orders.receive.title')}</DialogTitle>
        </DialogHeader>
        <GoodsReceiptFields
          purchaseOrder={purchaseOrder}
          receipts={receipts}
          branches={branches}
          productLabels={productLabels}
          onPosted={async () => {
            onOpenChange(false);
            await onPosted?.();
          }}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('actions.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

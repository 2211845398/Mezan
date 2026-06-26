import { useTranslation } from 'react-i18next';

import {
  FloatingFormDialog,
  FloatingFormDialogFooter,
} from '@/components/shared/FloatingFormDialog';
import type { BranchRead } from '@/features/admin/types';

import GoodsReceiptFields, { GOODS_RECEIPT_FORM_ID } from '../../components/GoodsReceiptFields';
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
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('orders.receive.title')}
      maxWidth="lg"
      footer={
        <FloatingFormDialogFooter
          formId={GOODS_RECEIPT_FORM_ID}
          onCancel={() => onOpenChange(false)}
          saveLabel={t('orders.receive.submit')}
          cancelLabel={tCommon('actions.cancel')}
        />
      }
    >
      <GoodsReceiptFields
        purchaseOrder={purchaseOrder}
        receipts={receipts}
        branches={branches}
        productLabels={productLabels}
        formId={GOODS_RECEIPT_FORM_ID}
        hideFooterActions
        onPosted={async () => {
          onOpenChange(false);
          await onPosted?.();
        }}
      />
    </FloatingFormDialog>
  );
}

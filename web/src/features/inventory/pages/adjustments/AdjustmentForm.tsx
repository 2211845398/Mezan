import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { newIdempotencyKey } from '@/lib/idempotency';

import PoLineVariantSelect from '@/features/purchasing/components/PoLineVariantSelect';
import { ProductSearch } from '@/features/pos/components/ProductSearch';

import InventoryProductLineFields from '../../components/InventoryProductLineFields';
import { postHumanInventoryMovement } from '../../api';
import { inventoryKeys } from '../../queries';

/** Simple movements kept in the floating dialog; complex flows use dedicated pages. */
const TXN_TYPES = ['issue_stock', 'return_stock', 'count_adjust'] as const;

export const ADJUSTMENT_DIALOG_FORM_ID = 'inventory-adjustment-dialog-form';

export type AdjustmentFormProps = {
  variant?: 'page' | 'dialog';
  onDismiss?: () => void;
};

export default function AdjustmentForm({ variant = 'page', onDismiss }: AdjustmentFormProps = {}) {
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const [branchId, setBranchId] = useState('');
  const [productId, setProductId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [variantLabel, setVariantLabel] = useState('');
  const [uomId, setUomId] = useState(0);
  const [txn, setTxn] = useState<(typeof TXN_TYPES)[number]>('count_adjust');
  const [quantity, setQuantity] = useState('1');
  const [qtySigned, setQtySigned] = useState('0');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: async () => {
      if (!branchId || productId == null) {
        throw new Error('branch/product');
      }
      const reasonSent = reason.trim() || 'manual_movement';
      const base = {
        idempotency_key: newIdempotencyKey(),
        branch_id: Number(branchId),
        product_id: productId,
        variant_id: variantId && variantId > 0 ? variantId : undefined,
        uom_id: txn !== 'count_adjust' && uomId > 0 ? uomId : undefined,
        transaction_type: txn,
        notes: notes.trim() || '',
        reason: reasonSent,
      };
      if (txn === 'count_adjust') {
        return postHumanInventoryMovement({
          ...base,
          qty_signed: Number(qtySigned),
        });
      }
      return postHumanInventoryMovement({
        ...base,
        quantity: Number(quantity),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('adjustments.posted'));
      onDismiss?.();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const fields = (
    <>
      <div>
        <Label>{t('adjustments.field.branch')}</Label>
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{t('adjustments.field.type')}</Label>
        <Select value={txn} onValueChange={(v) => setTxn(v as (typeof TXN_TYPES)[number])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TXN_TYPES.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`adjustments.txn.${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {txn === 'count_adjust' ? (
        <>
          <div>
            <Label>{t('adjustments.field.product')}</Label>
            <ProductSearch
              value={productId == null ? undefined : String(productId)}
              onChange={setProductId}
            />
          </div>
          {productId != null && productId > 0 ? (
            <PoLineVariantSelect
              compact
              productId={productId}
              variantId={variantId}
              variantPickLabel={variantLabel}
              onVariantPick={(id, label) => {
                setVariantId(id);
                setVariantLabel(label);
              }}
            />
          ) : null}
          <div>
            <Label>{t('adjustments.field.qty_signed')}</Label>
            <Input
              type="number"
              value={qtySigned}
              onChange={(e) => setQtySigned(e.target.value)}
              step={1}
            />
          </div>
        </>
      ) : (
        <InventoryProductLineFields
          productId={productId}
          variantId={variantId}
          variantLabel={variantLabel}
          uomId={uomId}
          qty={quantity}
          onProductId={setProductId}
          onVariant={(id, label) => {
            setVariantId(id);
            setVariantLabel(label);
          }}
          onUomId={setUomId}
          onQty={setQuantity}
        />
      )}
      <div>
        <Label>{t('adjustments.field.notes')}</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div>
        <Label>{t('adjustments.field.reason')}</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('adjustments.field.reason_placeholder')}
        />
      </div>
      {variant === 'page' ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void m.mutate()} disabled={m.isPending}>
            {t('actions.submit')}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link to="/inventory/adjustments">{t('actions.cancel')}</Link>
          </Button>
        </div>
      ) : null}
    </>
  );

  if (variant === 'dialog') {
    return (
      <form
        id={ADJUSTMENT_DIALOG_FORM_ID}
        className="mx-auto max-w-lg space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void m.mutate();
        }}
      >
        {fields}
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('adjustments.new')}</h1>
      {fields}
    </div>
  );
}

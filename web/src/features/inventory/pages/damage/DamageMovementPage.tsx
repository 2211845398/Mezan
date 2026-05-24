import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/ContentSurface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { newIdempotencyKey } from '@/lib/idempotency';

import InventoryProductLineFields from '../../components/InventoryProductLineFields';
import { postHumanInventoryMovement } from '../../api';
import { inventoryKeys } from '../../queries';

export default function DamageMovementPage() {
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [branchId, setBranchId] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [variantLabel, setVariantLabel] = useState('');
  const [uomId, setUomId] = useState(0);
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');

  const submitM = useMutation({
    mutationFn: () => {
      if (branchId == null || productId == null) throw new Error('fields');
      if (!reason.trim()) throw new Error('reason');
      return postHumanInventoryMovement({
        idempotency_key: newIdempotencyKey(),
        branch_id: branchId,
        product_id: productId,
        variant_id: variantId && variantId > 0 ? variantId : undefined,
        uom_id: uomId > 0 ? uomId : undefined,
        transaction_type: 'damage_mark',
        quantity: Number(qty),
        reason: reason.trim(),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('movement.damage.posted'));
      navigate('/inventory/damage');
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('movement.damage.title')}
        subtitle={t('movement.damage.subtitle')}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/inventory/damage')}>
            {tc('actions.back')}
          </Button>
        }
      />
      <SectionCard>
        <div className="mb-4 max-w-md">
          <BranchCombobox
            label={t('adjustments.field.branch')}
            value={branchId}
            onChange={setBranchId}
          />
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{t('movement.damage.mark_only_hint')}</p>
        <InventoryProductLineFields
          productId={productId}
          variantId={variantId}
          variantLabel={variantLabel}
          uomId={uomId}
          qty={qty}
          productClearable
          variantLabelMode="variant"
          onProductId={setProductId}
          onVariant={(id, label) => {
            setVariantId(id);
            setVariantLabel(label);
          }}
          onUomId={setUomId}
          onQty={setQty}
        />
        <div className="mt-4">
          <Label>{t('adjustments.field.reason')}</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('adjustments.field.reason_placeholder')}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button type="button" disabled={submitM.isPending} onClick={() => void submitM.mutate()}>
            {t('adjustments.txn.damage_mark')}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/inventory/damage')}>
            {t('actions.cancel')}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

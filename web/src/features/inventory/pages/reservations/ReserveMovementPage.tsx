import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/ContentSurface';
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

import InventoryProductLineFields from '../../components/InventoryProductLineFields';
import { postHumanInventoryMovement } from '../../api';
import { inventoryKeys } from '../../queries';

export default function ReserveMovementPage() {
  const { t } = useTranslation('inventory');
  const navigate = useNavigate();
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
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');

  const submitM = useMutation({
    mutationFn: () => {
      if (!branchId || productId == null) throw new Error('fields');
      return postHumanInventoryMovement({
        idempotency_key: newIdempotencyKey(),
        branch_id: Number(branchId),
        product_id: productId,
        variant_id: variantId && variantId > 0 ? variantId : undefined,
        uom_id: uomId > 0 ? uomId : undefined,
        transaction_type: 'reserve',
        quantity: Number(qty),
        notes: notes.trim() || undefined,
        reason: 'manual_reserve',
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('movement.reserve.created'));
      navigate('/inventory/reservations');
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('movement.reserve.new')}
        subtitle={t('movement.reserve.new_subtitle')}
        actions={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/inventory/reservations">{t('actions.back')}</Link>
          </Button>
        }
      />
      <SectionCard>
        <div className="mb-4 max-w-xs">
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
        <InventoryProductLineFields
          productId={productId}
          variantId={variantId}
          variantLabel={variantLabel}
          uomId={uomId}
          qty={qty}
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
          <Label>{t('adjustments.field.notes')}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="mt-4">
          <Button type="button" disabled={submitM.isPending} onClick={() => void submitM.mutate()}>
            {t('movement.reserve.submit')}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

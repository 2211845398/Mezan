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
import { ProductSearch } from '@/features/pos/components/ProductSearch';
import { newIdempotencyKey } from '@/lib/idempotency';

import { postStockAdjustment } from '../../api';
import { inventoryKeys } from '../../queries';

export default function AdjustmentForm() {
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const [branchId, setBranchId] = useState<string>('');
  const [productId, setProductId] = useState<number | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('count');

  const m = useMutation({
    mutationFn: async () => {
      if (!branchId || productId == null) {
        throw new Error('branch/product');
      }
      return postStockAdjustment({
        branch_id: Number(branchId),
        product_id: productId,
        qty_delta: Number(delta),
        reason,
        idempotency_key: newIdempotencyKey(),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('adjustments.posted'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  return (
    <div className="max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('adjustments.new')}</h1>
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
        <Label>{t('adjustments.field.product')}</Label>
        <ProductSearch
          value={productId == null ? undefined : String(productId)}
          onChange={setProductId}
        />
      </div>
      <div>
        <Label>{t('adjustments.field.delta')}</Label>
        <Input
          type="number"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          step={1}
        />
      </div>
      <div>
        <Label>{t('adjustments.field.reason')}</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={() => void m.mutate()} disabled={m.isPending}>
          {t('actions.submit')}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link to="/inventory/adjustments">{t('actions.cancel')}</Link>
        </Button>
      </div>
    </div>
  );
}

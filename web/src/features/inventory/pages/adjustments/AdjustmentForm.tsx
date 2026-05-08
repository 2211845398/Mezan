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

import { postHumanInventoryMovement } from '../../api';
import { inventoryKeys } from '../../queries';

const TXN_TYPES = [
  'add_stock',
  'issue_stock',
  'return_stock',
  'damage_mark',
  'damage_scrap',
  'reserve',
  'release',
  'count_adjust',
] as const;

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
  const [branchId, setBranchId] = useState<string>('');
  const [productId, setProductId] = useState<number | null>(null);
  const [txn, setTxn] = useState<(typeof TXN_TYPES)[number]>('count_adjust');
  const [quantity, setQuantity] = useState('1');
  const [qtySigned, setQtySigned] = useState('0');
  const [unitCost, setUnitCost] = useState('');
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
        transaction_type: txn,
        notes: notes.trim() || undefined,
        reason: reasonSent,
      };
      if (txn === 'count_adjust') {
        return postHumanInventoryMovement({
          ...base,
          qty_signed: Number(qtySigned),
        });
      }
      if (txn === 'add_stock') {
        const raw = unitCost.trim().replace(',', '.');
        return postHumanInventoryMovement({
          ...base,
          quantity: Number(quantity),
          unit_cost: raw,
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

  const shell = variant === 'dialog' ? 'mx-auto max-w-lg space-y-4' : 'mx-auto max-w-lg space-y-4 p-6';

  return (
    <div className={shell}>
      {variant === 'page' ? (
        <h1 className="text-2xl font-semibold tracking-tight">{t('adjustments.new')}</h1>
      ) : null}
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
        <div>
          <Label>{t('adjustments.field.qty_signed')}</Label>
          <Input
            type="number"
            value={qtySigned}
            onChange={(e) => setQtySigned(e.target.value)}
            step={1}
          />
        </div>
      ) : (
        <div>
          <Label>{t('adjustments.field.quantity')}</Label>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            step={1}
            min={1}
          />
        </div>
      )}
      {txn === 'add_stock' ? (
        <div>
          <Label htmlFor="adj-unit-cost">{t('adjustments.field.unit_cost')}</Label>
          <Input
            id="adj-unit-cost"
            type="text"
            inputMode="decimal"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            dir="ltr"
            className="num-latin"
            placeholder="0.0000"
          />
        </div>
      ) : null}
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
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => {
            if (txn === 'add_stock') {
              const raw = unitCost.trim().replace(',', '.');
              const uc = Number(raw);
              if (!Number.isFinite(uc) || uc <= 0) {
                toast.error(t('adjustments.errors.unit_cost_add_stock'));
                return;
              }
            }
            void m.mutate();
          }}
          disabled={m.isPending}
        >
          {t('actions.submit')}
        </Button>
        {onDismiss ? (
          <Button type="button" variant="ghost" onClick={onDismiss}>
            {t('actions.cancel')}
          </Button>
        ) : (
          <Button type="button" variant="ghost" asChild>
            <Link to="/inventory/adjustments">{t('actions.cancel')}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

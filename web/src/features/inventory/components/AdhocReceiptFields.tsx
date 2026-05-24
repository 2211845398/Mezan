import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { SupplierCombobox } from '@/features/purchasing/components/SupplierCombobox';
import PoLineVariantSelect from '@/features/purchasing/components/PoLineVariantSelect';
import PoLineUomSelect from '@/features/purchasing/components/PoLineUomSelect';
import PoReceiveLineRow from '@/features/purchasing/components/PoReceiveLineRow';
import ReceiveUnitCostHint, {
  receiveUnitCostLabel,
} from '@/features/purchasing/components/ReceiveUnitCostHint';
import { buildProductUomOptions } from '@/features/purchasing/lib/productUomOptions';
import { ProductSearch } from '@/features/pos/components/ProductSearch';
import { getProduct } from '@/features/catalog/api';
import { catalogKeys } from '@/features/catalog/queries';
import { useQuery } from '@tanstack/react-query';
import { newIdempotencyKey } from '@/lib/idempotency';

import { postAdhocGoodsReceipt } from '../api';
import { inventoryKeys } from '../queries';

type DraftLine = {
  key: string;
  product_id: number;
  variant_id: number | null;
  variant_label: string;
  uom_id: number;
  qty: string;
  unit_cost: string;
};

function newLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    product_id: 0,
    variant_id: null,
    variant_label: '',
    uom_id: 0,
    qty: '1',
    unit_cost: '',
  };
}

type Props = {
  onCancel?: () => void;
};

export default function AdhocReceiptFields({ onCancel }: Props) {
  const { t } = useTranslation('inventory');
  const { t: tCatalog } = useTranslation('catalog');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [branchId, setBranchId] = useState<number | null>(null);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);

  const patchLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const payloadLines = useMemo(
    () =>
      lines
        .filter((l) => l.product_id > 0 && l.uom_id > 0 && Number(l.qty) > 0)
        .map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id && l.variant_id > 0 ? l.variant_id : undefined,
          qty: Number(l.qty),
          uom_id: l.uom_id,
          unit_cost: l.unit_cost.trim().replace(',', '.'),
        })),
    [lines],
  );

  const submitM = useMutation({
    mutationFn: () => {
      if (branchId == null) throw new Error('branch');
      if (payloadLines.length === 0) throw new Error('lines');
      for (const ln of payloadLines) {
        const uc = Number(ln.unit_cost);
        if (!Number.isFinite(uc) || uc <= 0) throw new Error('unit_cost');
      }
      return postAdhocGoodsReceipt({
        idempotency_key: newIdempotencyKey(),
        branch_id: branchId,
        supplier_id: supplierId,
        notes: notes.trim() || null,
        lines: payloadLines,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('movement.receipt.posted'));
      navigate('/inventory/stock');
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const handleCancel = () => {
    if (onCancel) onCancel();
    else navigate('/inventory/stock');
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <BranchCombobox
          label={t('adjustments.field.branch')}
          value={branchId}
          onChange={setBranchId}
        />
        <SupplierCombobox
          label={t('movement.receipt.supplier')}
          value={supplierId}
          onChange={setSupplierId}
        />
      </div>

      <div className="space-y-4">
        {lines.map((line) => (
          <AdhocReceiptLineRow
            key={line.key}
            line={line}
            canRemove={lines.length > 1}
            onPatch={(patch) => patchLine(line.key, patch)}
            onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
            t={t}
            tCatalog={tCatalog}
          />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, newLine()])}>
          <Plus className="me-2 size-4" />
          {t('movement.add_line')}
        </Button>
      </div>

      <div className="space-y-1.5 rounded-md border bg-card p-3">
        <Label className="text-xs font-medium text-muted-foreground">{t('adjustments.field.notes')}</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="min-h-[3.5rem] resize-y text-sm" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={submitM.isPending} onClick={() => void submitM.mutate()}>
          {t('movement.receipt.submit')}
        </Button>
        <Button type="button" variant="outline" onClick={handleCancel}>
          {t('movement.receipt.cancel')}
        </Button>
      </div>
    </div>
  );
}

function AdhocReceiptLineRow({
  line,
  canRemove,
  onPatch,
  onRemove,
  t,
  tCatalog,
}: {
  line: DraftLine;
  canRemove: boolean;
  onPatch: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  t: (key: string) => string;
  tCatalog: (key: string, options?: Record<string, unknown>) => string;
}) {
  const pid = line.product_id;
  const { data: product } = useQuery({
    queryKey: catalogKeys.product(pid),
    queryFn: () => getProduct(pid),
    enabled: pid > 0,
  });
  const uomOptions = useMemo(
    () => (product ? buildProductUomOptions(tCatalog, product) : []),
    [product, tCatalog],
  );
  const uomDisplay = uomOptions.find((o) => o.id === line.uom_id)?.label ?? '—';
  const unitCostLabel = receiveUnitCostLabel(t, line.uom_id, uomOptions);

  useEffect(() => {
    if (uomOptions.length > 0 && line.uom_id <= 0) {
      onPatch({ uom_id: uomOptions[0]!.id });
    }
  }, [pid, uomOptions, line.uom_id, onPatch]);

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <PoReceiveLineRow
        variant={
          <div className="space-y-2">
            <ProductSearch
              clearable
              value={line.product_id > 0 ? String(line.product_id) : undefined}
              onChange={(id) =>
                onPatch({
                  product_id: id ?? 0,
                  variant_id: null,
                  variant_label: '',
                  uom_id: 0,
                })
              }
            />
            <PoLineVariantSelect
              compact
              labelMode="variant"
              productId={pid}
              variantId={line.variant_id}
              variantPickLabel={line.variant_label}
              disabled={pid <= 0}
              onVariantPick={(vid, label) => onPatch({ variant_id: vid, variant_label: label })}
            />
          </div>
        }
        uomControl={
          uomOptions.length > 0 ? (
            <PoLineUomSelect
              fullWidth
              disabled={pid <= 0}
              uomId={line.uom_id}
              options={uomOptions}
              onChange={(uom_id) => onPatch({ uom_id })}
            />
          ) : undefined
        }
        uomDisplay={uomDisplay}
        qty={line.qty}
        unitCost={line.unit_cost}
        unitCostLabel={unitCostLabel}
        unitCostFooter={
          pid > 0 && line.uom_id > 0 ? (
            <ReceiveUnitCostHint productId={pid} uomId={line.uom_id} unitCost={line.unit_cost} />
          ) : null
        }
        onQtyChange={(qty) => onPatch({ qty })}
        onUnitCostChange={(unit_cost) => onPatch({ unit_cost })}
        actions={
          canRemove ? (
            <Button type="button" variant="ghost" size="icon" aria-label={t('movement.remove_line')} onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          ) : null
        }
      />
    </div>
  );
}

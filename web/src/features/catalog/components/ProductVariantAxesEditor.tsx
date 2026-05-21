import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import type { VariantDraftRow } from '../api';
import { cartesianVariantCount } from '../lib/cartesianCount';
import type { VariantAxisLine } from '../lib/rebuildVariantAxes';
import { CatalogAttributeCreatableSelect } from './CatalogAttributeCreatableSelect';
import { CatalogAttributeValueCreatableMultiSelect } from './CatalogAttributeValueCreatableMultiSelect';
import { ProductVariantsGrid } from './ProductVariantsGrid';

export type { VariantAxisLine };

type Props = {
  productId: number | null;
  productName: string;
  axes: VariantAxisLine[];
  onAxesChange: (axes: VariantAxisLine[]) => void;
  variantRows: VariantDraftRow[];
  onVariantRowsChange: (rows: VariantDraftRow[]) => void;
  disabled?: boolean | undefined;
};

export function ProductVariantAxesEditor({
  productId,
  productName,
  axes,
  onAxesChange,
  variantRows,
  onVariantRowsChange,
  disabled,
}: Props) {
  const { t } = useTranslation('catalog');
  const isDraft = productId === null;
  const previewCount = cartesianVariantCount(
    axes.map((a) => ({ valueIds: a.selectedValueIds })),
  );
  const hasAxes = axes.some((a) => a.selectedValueIds.length > 0);

  const addLine = () => {
    onAxesChange([...axes, { attributeId: 0, selectedValueIds: [] }]);
  };

  const updateLine = (index: number, patch: Partial<VariantAxisLine>) => {
    onAxesChange(axes.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    onAxesChange(axes.filter((_, i) => i !== index));
  };

  const usedAttributeIds = axes.map((a) => a.attributeId).filter((id) => id > 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('products.axes.hint')}</p>

      <div className="space-y-3">
        {axes.map((line, index) => (
          <div
            key={`axis-${index}-${line.attributeId}`}
            className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start"
          >
            <div className="w-full sm:w-44">
              <Label className="mb-1 block text-xs text-muted-foreground">
                {t('products.axes.attribute')}
              </Label>
              <CatalogAttributeCreatableSelect
                value={line.attributeId > 0 ? line.attributeId : null}
                excludeAttributeIds={usedAttributeIds.filter((id) => id !== line.attributeId)}
                disabled={disabled}
                onChange={(attributeId) =>
                  updateLine(index, { attributeId, selectedValueIds: [] })
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <Label className="mb-1 block text-xs text-muted-foreground">
                {t('products.variants.values_label')}
              </Label>
              <CatalogAttributeValueCreatableMultiSelect
                attributeId={line.attributeId}
                valueIds={line.selectedValueIds}
                disabled={disabled || line.attributeId <= 0}
                onChange={(selectedValueIds) => updateLine(index, { selectedValueIds })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 self-end"
              disabled={disabled}
              onClick={() => removeLine(index)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={addLine}>
        <Plus className="me-1 h-4 w-4" />
        {t('products.axes.add_line')}
      </Button>

      {isDraft ? (
        <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          {hasAxes
            ? t('products.axes.draft_preview', { count: previewCount })
            : t('products.axes.draft_simple')}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t('products.variants.title')}
              {variantRows.length > 0 ? (
                <span className="ms-2 text-muted-foreground font-normal">
                  ({variantRows.length})
                </span>
              ) : null}
            </p>
            <ProductVariantsGrid
              rows={variantRows}
              productName={productName}
              disabled={disabled}
              onRowsChange={onVariantRowsChange}
            />
          </div>
        </>
      )}
    </div>
  );
}

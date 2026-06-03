import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Barcode, ChevronDown, Download, Plus, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  exportVariantBarcodesCsvBlob,
  generateMissingVariantBarcodes,
  getProductWithVariants,
  type VariantDraftRow,
} from '../api';
import { mapApiVariantsToDraft } from '../lib/variantSyncHelpers';
import { catalogKeys } from '../queries';
import type { VariantAxisLine } from '../lib/rebuildVariantAxes';
import { CatalogAttributeCreatableSelect } from './CatalogAttributeCreatableSelect';
import { CatalogAttributeValueCreatableMultiSelect } from './CatalogAttributeValueCreatableMultiSelect';
import { ProductArchivedVariantsGrid } from './ProductArchivedVariantsGrid';
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

const axisRowGrid =
  'grid w-full gap-3 p-4 sm:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)_auto] sm:items-start';

export function ProductVariantAxesEditor({
  productId,
  productName,
  axes,
  onAxesChange,
  variantRows,
  onVariantRowsChange,
  disabled,
}: Props) {
  const { t, i18n } = useTranslation('catalog');
  const isDraft = productId === null;

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
  const activeRows = variantRows.filter((r) => r.active);
  const archivedRows = variantRows.filter((r) => !r.active);

  const patchActiveRows = (nextVisible: VariantDraftRow[]) => {
    const archived = variantRows.filter((r) => !r.active);
    const rowKey = (r: VariantDraftRow) => String(r.id ?? r.sku);
    const visibleMap = new Map(nextVisible.map((r) => [rowKey(r), r]));
    const mergedActive = activeRows.map((r) => visibleMap.get(rowKey(r)) ?? r);
    onVariantRowsChange([...mergedActive, ...archived]);
  };

  const reactivateVariant = (variantId: number) => {
    onVariantRowsChange(
      variantRows.map((r) => (r.id === variantId ? { ...r, active: true } : r)),
    );
  };

  const qc = useQueryClient();
  const [variantSearch, setVariantSearch] = useState('');
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredActiveRows = useMemo(() => {
    const q = variantSearch.trim().toLowerCase();
    if (!q) return activeRows;
    return activeRows.filter((r) => {
      const hay = [r.display_label, r.sku, r.reference_code, r.barcode, productName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeRows, variantSearch, productName]);

  const searchHasNoResults =
    activeRows.length > 0 && filteredActiveRows.length === 0 && variantSearch.trim() !== '';

  const refreshVariants = async () => {
    if (productId == null) return;
    const refreshed = await getProductWithVariants(productId);
    onVariantRowsChange(mapApiVariantsToDraft(refreshed.variants));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshVariants();
    } catch (err) {
      notifyApiError(err, t('errors.generic'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const generateBarcodesM = useMutation({
    mutationFn: () => generateMissingVariantBarcodes(productId!),
    onSuccess: async (res) => {
      await refreshVariants();
      void qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('products.variants.barcodes_generated', { count: res.assigned }));
    },
    onError: (err) => notifyApiError(err, t('errors.generic')),
  });

  const exportBarcodes = async () => {
    if (productId == null) return;
    try {
      const blob = await exportVariantBarcodesCsvBlob(productId, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `product_${productId}_barcodes.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notifyApiError(err, t('errors.generic'));
    }
  };

  const hasArchived = archivedRows.length > 0;
  const toolbarRowClass = 'flex flex-wrap items-center gap-4';

  const variantSearchInput = (
    <Input
      id="variant-grid-search"
      value={variantSearch}
      onChange={(e) => setVariantSearch(e.target.value)}
      placeholder={t('products.variants.grid_search_ph')}
      aria-label={t('products.variants.grid_search_label')}
      className="h-9 min-w-[12rem] flex-1 basis-48 sm:max-w-md"
      disabled={disabled}
    />
  );

  const variantRefreshButton = (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0"
      disabled={disabled || isRefreshing}
      title={t('actions.refresh')}
      aria-label={t('actions.refresh')}
      onClick={() => void handleRefresh()}
    >
      <RefreshCw className={cn('size-4', isRefreshing && 'animate-spin')} />
    </Button>
  );

  const variantGridBlock = (
    <>
      {searchHasNoResults ? (
        <p className="text-sm text-muted-foreground">{t('products.variants.grid_search_empty')}</p>
      ) : null}
      <ProductVariantsGrid
        rows={filteredActiveRows}
        productName={productName}
        disabled={disabled}
        onRowsChange={patchActiveRows}
      />
    </>
  );

  return (
    <div dir={i18n.dir()} className="w-full space-y-4 text-start">
      <div className="w-full overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
        {axes.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t('products.axes.empty')}</p>
        ) : (
          axes.map((line, index) => (
            <div key={`axis-${index}-${line.attributeId}`} className={axisRowGrid}>
              <div className="min-w-0">
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
              <div className="min-w-0">
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
                className="h-8 w-8 shrink-0 justify-self-end sm:mt-6"
                disabled={disabled}
                onClick={() => removeLine(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="flex justify-start">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={addLine}>
          <Plus className="me-1 h-4 w-4" />
          {t('products.axes.add_line')}
        </Button>
      </div>

      {!isDraft ? (
        <div className="w-full space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {t('products.variants.title')}
              {activeRows.length > 0 ? (
                <span className="ms-2 font-normal text-muted-foreground">({activeRows.length})</span>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-1.5 ltr:flex-row-reverse"
                disabled={disabled || generateBarcodesM.isPending}
                onClick={() => generateBarcodesM.mutate()}
              >
                {t('products.variants.generate_barcodes')}
                <Barcode className="h-4 w-4 shrink-0" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-1.5 ltr:flex-row-reverse"
                disabled={disabled || activeRows.length === 0}
                onClick={() => void exportBarcodes()}
              >
                {t('products.variants.export_barcodes')}
                <Download className="h-4 w-4 shrink-0" />
              </Button>
            </div>
          </div>

          {hasArchived ? (
            <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen} className="w-full space-y-3">
              <div className={toolbarRowClass}>
                {variantSearchInput}
                {variantRefreshButton}
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2">
                    <ChevronDown
                      className={cn('size-4 transition-transform', archivedOpen && 'rotate-180')}
                    />
                    {t('products.variants.archived_title', { count: archivedRows.length })}
                  </Button>
                </CollapsibleTrigger>
              </div>
              {variantGridBlock}
              <CollapsibleContent className="pt-0">
                <ProductArchivedVariantsGrid
                  rows={archivedRows}
                  disabled={disabled}
                  onReactivate={reactivateVariant}
                />
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <div className="w-full space-y-3">
              <div className={toolbarRowClass}>
                {variantSearchInput}
                {variantRefreshButton}
              </div>
              {variantGridBlock}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CategoryAttrDef } from '@/features/catalog/api';
import { getProductWithVariants, listCategoryAttributes } from '@/features/catalog/api';
import { catalogKeys } from '@/features/catalog/queries';
import { cn } from '@/lib/utils';

import {
  formatAttributeSummary,
  resolveVariantFromAttributes,
  stringRecordFromUnknownValues,
  type DraftTransferLine,
} from './transferDraft';

const SELECT_EMPTY = '__unset__';

function normalizeAttrType(type: string): string {
  const low = type.toLowerCase();
  if (low === 'integer') return 'int';
  if (low === 'boolean') return 'bool';
  if (low === 'number' || low === 'decimal') return 'float';
  if (low === 'enum') return 'select';
  return low;
}

function selectChoices(d: CategoryAttrDef): string[] {
  const o = d.options as { values?: unknown; choices?: unknown } | null | undefined;
  const raw = o?.values ?? o?.choices;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

function sortedDefs(defs: CategoryAttrDef[]): CategoryAttrDef[] {
  return defs.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.key.localeCompare(b.key));
}

type TransferLineAttributesCellProps = {
  line: DraftTransferLine;
  lineIndex: number;
  onPatchLine: (index: number, patch: Partial<DraftTransferLine>) => void;
};

export function TransferLineAttributesCell({ line, lineIndex, onPatchLine }: TransferLineAttributesCellProps) {
  const { t } = useTranslation('inventory');
  const categoryId = line.category_id;

  const defsQuery = useQuery({
    queryKey: catalogKeys.categoryAttrs(categoryId, true),
    queryFn: () => listCategoryAttributes(categoryId, { includeInherited: true }),
    enabled: categoryId > 0,
  });

  const variantsQuery = useQuery({
    queryKey: catalogKeys.productWithVariants(line.product_id),
    queryFn: () => getProductWithVariants(line.product_id),
    enabled: line.product_id > 0,
  });

  const defs = defsQuery.data ?? [];
  const variants = variantsQuery.data?.variants ?? [];
  const defsSorted = sortedDefs(defs);

  const hydratedRef = useRef(false);
  useEffect(() => {
    hydratedRef.current = false;
  }, [line.product_id]);

  useEffect(() => {
    if (hydratedRef.current || !variants.length || !defsSorted.length || line.variant_id == null) return;
    const row = variants.find((v) => v.id === line.variant_id);
    if (!row?.attribute_values || typeof row.attribute_values !== 'object') {
      hydratedRef.current = true;
      return;
    }
    const fromV = stringRecordFromUnknownValues(row.attribute_values as Record<string, unknown>);
    const next = { ...line.attribute_values };
    let changed = false;
    for (const [k, v] of Object.entries(fromV)) {
      if (!(k in next) || (next[k] ?? '').trim() === '') {
        next[k] = v;
        changed = true;
      }
    }
    if (!changed) {
      hydratedRef.current = true;
      return;
    }
    const matched = resolveVariantFromAttributes(variants, next, defsSorted);
    if (matched?.id === line.variant_id) {
      onPatchLine(lineIndex, {
        attribute_values: next,
        variant_attributes: formatAttributeSummary(defsSorted, next).trim() || line.variant_attributes,
      });
    }
    hydratedRef.current = true;
  }, [variants, defsSorted, line.variant_id, lineIndex, line.attribute_values, line.variant_attributes, line.product_id, onPatchLine]);

  const applyUi = useCallback(
    (nextUi: Record<string, string>) => {
      const matched = resolveVariantFromAttributes(variants, nextUi, defsSorted);

      if (!matched) {
        toast.error(t('transfers.attributes_no_match'));
        onPatchLine(lineIndex, {
          attribute_values: nextUi,
          variant_id: null,
          variant_sku: '—',
          variant_attributes: formatAttributeSummary(defsSorted, nextUi).trim() || line.variant_attributes,
        });
        return;
      }

      onPatchLine(lineIndex, {
        attribute_values: nextUi,
        variant_id: matched.id,
        variant_sku: matched.sku.trim(),
        variant_attributes: formatAttributeSummary(defsSorted, nextUi).trim() || line.variant_attributes,
      });
    },
    [variants, defsSorted, lineIndex, line.variant_attributes, line.attribute_values, onPatchLine, line.variant_id, t],
  );

  const onChangeKey = useCallback(
    (key: string, value: string) => {
      const nextUi = { ...line.attribute_values, [key]: value };
      applyUi(nextUi);
    },
    [line.attribute_values, applyUi],
  );

  if (defsQuery.isLoading || variantsQuery.isLoading) {
    return <span className="text-xs text-muted-foreground">{t('loading')}</span>;
  }

  if (defsQuery.isError || variantsQuery.isError) {
    return <span className="text-xs text-destructive">{t('errors.generic')}</span>;
  }

  if (!defsSorted.length) {
    return (
      <span className="text-sm text-muted-foreground">
        {line.variant_attributes?.trim() ? line.variant_attributes : '—'}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {defsSorted.map((def) => {
        const tNorm = normalizeAttrType(def.type);
        const choices = selectChoices(def);
        const useSelect = tNorm === 'select' && choices.length > 0;
        const val = line.attribute_values[def.key] ?? '';

        if (useSelect) {
          const selectVal = val.length > 0 ? val : SELECT_EMPTY;
          return (
            <div key={def.id} className="grid min-w-0 gap-1">
              <Label className="text-xs text-muted-foreground">{def.label}</Label>
              <Select
                value={selectVal}
                onValueChange={(v) => onChangeKey(def.key, v === SELECT_EMPTY ? '' : v)}
              >
                <SelectTrigger className="h-8 w-full min-w-0 text-start text-xs">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {!def.required ? (
                    <SelectItem value={SELECT_EMPTY}>
                      <span className="text-muted-foreground">—</span>
                    </SelectItem>
                  ) : (
                    <SelectItem value={SELECT_EMPTY} disabled className="text-muted-foreground">
                      {t('transfers.select_attr_placeholder')}
                    </SelectItem>
                  )}
                  {choices.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        return (
          <div key={def.id} className="grid min-w-0 gap-1">
            <Label className="text-xs text-muted-foreground">{def.label}</Label>
            <Input
              className={cn('h-8 text-xs', !line.variant_id && 'border-destructive/80')}
              value={val}
              onChange={(e) => {
                const next = { ...line.attribute_values, [def.key]: e.target.value };
                onPatchLine(lineIndex, {
                  attribute_values: next,
                  variant_id: null,
                  variant_sku: '—',
                });
              }}
              onBlur={(e) => {
                const next = { ...line.attribute_values, [def.key]: e.target.value };
                applyUi(next);
              }}
              dir="auto"
            />
          </div>
        );
      })}
    </div>
  );
}

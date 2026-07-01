import { useQueryClient } from '@tanstack/react-query';
import { Minus, Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { NonNegativeIntegerInput } from '@/components/shared/form/NonNegativeIntegerInput';
import { parseNonNegativeInt } from '@/lib/numericInput';
import { formatCurrency } from '@/lib/format';
import { formatQtyWithLocalizedUom } from '@/lib/localizedUom';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';

import type { CartRead } from '../api';
import { findProductInCatalogCache } from '../cartTotalsApprox';
import { CartLineUomToggle, type CartLineUomOption } from './CartLineUomToggle';

type CartLine = NonNullable<CartRead['lines']>[number];

export type CartLineRowProps = {
  line: CartLine;
  currency: string;
  editable: boolean;
  maxQty?: number;
  isReturnLine?: boolean;
  isSelected?: boolean;
  onQtyChange: (lineId: number, productId: number, variantId: number, qty: number) => void;
  onUomChange?: (lineId: number, productId: number, variantId: number, uomId: number) => void;
};

function lineImageSrc(line: CartLine): string | null {
  const raw = line.product_image_url?.trim();
  if (!raw) return null;
  return resolveMediaUrl(raw) ?? raw;
}

export function CartLineRow({
  line,
  currency,
  editable,
  maxQty,
  isReturnLine = false,
  isSelected = false,
  onQtyChange,
  onUomChange,
}: CartLineRowProps) {
  const { t, i18n } = useTranslation('pos');
  const { t: tc } = useTranslation('catalog');
  const qc = useQueryClient();
  const [imgBroken, setImgBroken] = useState(false);
  const imgSrc = lineImageSrc(line);
  const showImg = imgSrc && !imgBroken;
  const serverName = line.product_name?.trim();
  const serverSku = line.product_sku?.trim();
  const catalogHit =
    !serverName && !serverSku ? findProductInCatalogCache(qc, line.product_id) : undefined;
  const label =
    serverName ||
    serverSku ||
    catalogHit?.name?.trim() ||
    catalogHit?.sku?.trim() ||
    t('register.product_unlabeled');

  const uomCode = (line as { uom_code?: string }).uom_code ?? line.uom_symbol;
  const uomOptions =
    (line as { available_uoms?: CartLineUomOption[] }).available_uoms ?? [];
  const variantTags =
    (line as { variant_attribute_tags?: { attribute_name: string; value_label: string }[] })
      .variant_attribute_tags ?? [];
  const activeUomId = (line as { uom_id?: number }).uom_id ?? 0;
  const hasMultipleUoms = uomOptions.length > 1;
  const canChangeUom = hasMultipleUoms && editable && !!onUomChange;

  const rowDir = i18n.dir() === 'rtl' ? 'rtl' : 'ltr';
  const currentQty = Number(line.qty);
  const atMax = maxQty != null && currentQty >= maxQty;

  function applyQty(next: number) {
    const capped =
      maxQty != null ? Math.min(maxQty, Math.max(0, next)) : Math.max(0, next);
    onQtyChange(line.id, line.product_id, line.variant_id, capped);
  }

  const qtyUomLabel = formatQtyWithLocalizedUom(line.qty, uomCode, tc);
  const unitPriceStr = formatCurrency(Number.parseFloat(String(line.unit_price)), currency);

  const priceQtyLabel = hasMultipleUoms
    ? `${unitPriceStr} × ${line.qty}`
    : `${unitPriceStr} × ${qtyUomLabel}`;

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col items-stretch gap-3 overflow-hidden border-b border-border/80 bg-card/80 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-start sm:gap-x-4 sm:gap-y-0 sm:px-4 sm:ps-5',
        isReturnLine && 'border-s-4 border-s-amber-500 bg-amber-50/40 dark:bg-amber-950/20',
        isSelected &&
          !isReturnLine &&
          'rounded-xl border border-primary/40 bg-emerald-50/40 shadow-sm dark:border-primary/50 dark:bg-primary/10',
        isSelected && isReturnLine && 'rounded-xl border border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/30',
      )}
      dir={rowDir}
      aria-selected={isSelected}
    >
      {isSelected ? (
        <span
          className="absolute inset-y-2 start-0 w-1 rounded-full bg-primary"
          aria-hidden
        />
      ) : null}
      <div className="relative mx-auto size-14 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40 sm:mx-0 sm:size-16">
        {showImg ? (
          <img
            src={imgSrc}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            onError={() => setImgBroken(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Package className="size-7 opacity-50" aria-hidden />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 self-center py-0.5 text-center sm:text-start">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <div className="truncate text-sm font-semibold leading-snug text-foreground sm:text-base">
            {label}
          </div>
          {isReturnLine ? (
            <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              {t('return.title')}
            </span>
          ) : null}
        </div>
        {variantTags.length > 0 ? (
          <ul className="mt-1 flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground sm:justify-start">
            {variantTags.map((tag) => (
              <li key={`${tag.attribute_name}-${tag.value_label}`}>
                <span className="font-medium text-foreground/70">{tag.attribute_name}:</span>{' '}
                {tag.value_label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        className="flex shrink-0 flex-col items-center justify-center gap-1 self-center tabular-nums sm:min-w-[6.5rem]"
        dir="ltr"
      >
        <span className="max-w-full text-[11px] leading-tight text-muted-foreground sm:text-xs">
          {priceQtyLabel}
        </span>
        {hasMultipleUoms ? (
          <CartLineUomToggle
            options={uomOptions}
            activeUomId={activeUomId}
            editable={canChangeUom}
            triggerLabel={qtyUomLabel}
            onSelect={(uomId) => {
              onUomChange?.(line.id, line.product_id, line.variant_id, uomId);
            }}
          />
        ) : null}
        <span className="max-w-full text-sm font-bold tracking-tight text-foreground sm:text-base">
          {formatCurrency(Number.parseFloat(String(line.line_total)), currency)}
        </span>
      </div>

      <div className="flex shrink-0 items-center justify-center self-center" dir="ltr">
        <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/95 p-0.5 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-md sm:size-8"
            disabled={!editable}
            onClick={() => applyQty(currentQty - 1)}
            aria-label="decrease"
          >
            <Minus className="size-3.5" aria-hidden />
          </Button>
          <NonNegativeIntegerInput
            min={0}
            {...(maxQty != null ? { max: maxQty } : {})}
            className="h-8 w-10 min-w-10 border-0 bg-transparent px-0.5 text-center text-xs font-semibold shadow-none focus-visible:ring-0 sm:h-8 sm:w-11 sm:min-w-11 sm:text-sm"
            value={line.qty}
            disabled={!editable}
            aria-label={t('register.qty')}
            onValueChange={(raw) => {
              const n = parseNonNegativeInt(raw);
              if (n != null) applyQty(n);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-md sm:size-8"
            disabled={!editable || atMax}
            onClick={() => applyQty(currentQty + 1)}
            aria-label="increase"
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

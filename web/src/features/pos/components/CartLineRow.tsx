import { useQueryClient } from '@tanstack/react-query';
import { Minus, Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import { formatQtyWithUom } from '@/lib/formatQtyWithUom';
import { resolveMediaUrl } from '@/lib/mediaUrl';

import type { CartRead } from '../api';
import { findProductInCatalogCache } from '../cartTotalsApprox';

export type CartLineRowProps = {
  line: NonNullable<CartRead['lines']>[number];
  currency: string;
  editable: boolean;
  /** Prefer `lineId` so optimistic rows and duplicate SKUs do not cross-update. */
  onQtyChange: (lineId: number, productId: number, variantId: number, qty: number) => void;
};

function lineImageSrc(line: CartLineRowProps['line']): string | null {
  const raw = line.product_image_url?.trim();
  if (!raw) return null;
  return resolveMediaUrl(raw) ?? raw;
}

export function CartLineRow({ line, currency, editable, onQtyChange }: CartLineRowProps) {
  const { t, i18n } = useTranslation('pos');
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

  const rowDir = i18n.dir() === 'rtl' ? 'rtl' : 'ltr';

  return (
    <div
      className="flex min-w-0 flex-col items-stretch gap-3 border-b border-border/80 bg-card/80 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-start sm:gap-x-4 sm:gap-y-0 sm:px-4"
      dir={rowDir}
    >
      {/* 1 — بداية السطر (يمين في RTL): الصورة */}
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

      {/* 2 — اسم المنتج (وسط مرن) */}
      <div className="min-w-0 flex-1 self-center py-0.5 text-center sm:text-start" dir="auto">
        <div className="truncate text-sm font-semibold leading-snug text-foreground sm:text-base">{label}</div>
      </div>

      {/* 3 — السعر (محاذاة متماثلة للأرقام) */}
      <div
        className="flex shrink-0 flex-col items-center justify-center gap-0.5 self-center tabular-nums sm:min-w-[6.5rem]"
        dir="ltr"
      >
        <span className="max-w-full text-[11px] leading-tight text-muted-foreground sm:text-xs">
          {formatCurrency(Number.parseFloat(String(line.unit_price)), currency)} ×{' '}
          {formatQtyWithUom(line.qty, (line as { uom_symbol?: string }).uom_symbol)}
        </span>
        <span className="max-w-full text-sm font-bold tracking-tight text-foreground sm:text-base">
          {formatCurrency(Number.parseFloat(String(line.line_total)), currency)}
        </span>
      </div>

      {/* 4 — نهاية السطر (يسار في RTL): أزرار الكمية */}
      <div className="flex shrink-0 items-center justify-center self-center" dir="ltr">
        <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/95 p-0.5 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-md sm:size-8"
            disabled={!editable}
            onClick={() =>
              onQtyChange(line.id, line.product_id, line.variant_id, Math.max(0, Number(line.qty) - 1))
            }
            aria-label="decrease"
          >
            <Minus className="size-3.5" aria-hidden />
          </Button>
          <Input
            type="number"
            min={0}
            className="h-8 w-10 min-w-10 border-0 bg-transparent px-0.5 text-center text-xs font-semibold tabular-nums shadow-none focus-visible:ring-0 sm:h-8 sm:w-11 sm:min-w-11 sm:text-sm"
            value={line.qty}
            disabled={!editable}
            aria-label={t('register.qty')}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n) && n >= 0)
                onQtyChange(line.id, line.product_id, line.variant_id, n);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-md sm:size-8"
            disabled={!editable}
            onClick={() =>
              onQtyChange(line.id, line.product_id, line.variant_id, Number(line.qty) + 1)
            }
            aria-label="increase"
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

import { Minus, Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import { resolveMediaUrl } from '@/lib/mediaUrl';

import type { CartRead } from '../api';

export type CartLineRowProps = {
  line: NonNullable<CartRead['lines']>[number];
  currency: string;
  editable: boolean;
  /** Prefer `lineId` so optimistic rows and duplicate SKUs do not cross-update. */
  onQtyChange: (lineId: number, productId: number, qty: number) => void;
};

function lineImageSrc(line: CartLineRowProps['line']): string | null {
  const raw = line.product_image_url?.trim();
  if (!raw) return null;
  return resolveMediaUrl(raw) ?? raw;
}

export function CartLineRow({ line, currency, editable, onQtyChange }: CartLineRowProps) {
  const { t } = useTranslation('pos');
  const [imgBroken, setImgBroken] = useState(false);
  const imgSrc = lineImageSrc(line);
  const showImg = imgSrc && !imgBroken;

  return (
    <div className="flex min-w-0 flex-col gap-3 border-b border-border/80 bg-card/80 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      {/* Product: thumbnail + name (RTL-friendly) */}
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40 sm:size-16">
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
        <div className="min-w-0 flex-1 py-0.5">
          <div className="truncate text-sm font-semibold leading-snug sm:text-base">
            {line.product_name || line.product_sku}
          </div>
        </div>
      </div>

      {/* LTR strip: [−][qty][+] then prices to the geographic right of the stepper */}
      <div
        className="flex min-w-0 flex-row items-center justify-between gap-4 sm:shrink-0 sm:justify-end sm:gap-5"
        dir="ltr"
      >
        <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-background/95 p-1 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-lg sm:size-10"
            disabled={!editable}
            onClick={() => onQtyChange(line.id, line.product_id, Math.max(0, Number(line.qty) - 1))}
            aria-label="decrease"
          >
            <Minus className="size-4" aria-hidden />
          </Button>
          <Input
            type="number"
            min={0}
            className="h-9 w-12 min-w-12 border-0 bg-transparent px-1 text-center text-sm font-semibold tabular-nums shadow-none focus-visible:ring-0 sm:h-10 sm:w-14 sm:min-w-14"
            value={line.qty}
            disabled={!editable}
            aria-label={t('register.qty')}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n) && n >= 0) onQtyChange(line.id, line.product_id, n);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-lg sm:size-10"
            disabled={!editable}
            onClick={() => onQtyChange(line.id, line.product_id, Number(line.qty) + 1)}
            aria-label="increase"
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="flex min-w-[10.5rem] flex-col items-end justify-center gap-0.5 text-end sm:min-w-[12rem]">
          <span
            className="max-w-full text-[11px] leading-tight text-muted-foreground tabular-nums sm:text-xs"
            dir="ltr"
          >
            {formatCurrency(Number.parseFloat(String(line.unit_price)), currency)} × {line.qty}
          </span>
          <span
            className="max-w-full text-sm font-bold tabular-nums tracking-tight sm:text-base"
            dir="ltr"
          >
            {formatCurrency(Number.parseFloat(String(line.line_total)), currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

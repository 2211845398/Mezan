import { Package, Search } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import type { ProductRead } from '@/features/catalog/api';
import { type ListProductsParams, useProducts } from '@/features/catalog/queries';
import { resolveMediaUrl } from '@/lib/mediaUrl';

export type ProductGridProps = {
  disabled?: boolean;
  onAddProduct: (productId: number, qty?: number) => void;
  onPickProductWithVariants: (product: ProductRead) => void;
  /** Branch for stock filter (with {@link inStockOnly}). */
  branchId?: number | null;
  /** When true and {@link branchId} is set, only products with on_hand > 0 are listed. */
  inStockOnly?: boolean;
};

function productImageSrc(product: ProductRead): string | null {
  const raw = product.image_url?.trim();
  if (!raw) return null;
  return resolveMediaUrl(raw) ?? raw;
}

function productHasVariants(product: ProductRead): boolean {
  if (product.has_variants === true) return true;
  return (product.variant_count ?? 0) > 1;
}

/** Single click = +1 after short delay; second click before delay = double-click → +2 total (POS convention). */
const ProductTile = memo(function ProductTile({
  product,
  disabled,
  onAddProduct,
  onPickProductWithVariants,
}: {
  product: ProductRead;
  disabled: boolean;
  onAddProduct: (productId: number, qty?: number) => void;
  onPickProductWithVariants: (product: ProductRead) => void;
}) {
  const clickTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (clickTimerRef.current != null) {
        window.clearTimeout(clickTimerRef.current);
      }
    },
    [],
  );

  const imgSrc = productImageSrc(product);

  const handleAdd = (qty: number) => {
    if (productHasVariants(product)) {
      onPickProductWithVariants(product);
      return;
    }
    if (!Number.isFinite(product.id) || product.id <= 0) {
      return;
    }
    onAddProduct(product.id, qty);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (clickTimerRef.current != null) {
          window.clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
          handleAdd(2);
          return;
        }
        clickTimerRef.current = window.setTimeout(() => {
          clickTimerRef.current = null;
          handleAdd(1);
        }, 280);
      }}
      className="group flex min-h-0 flex-col overflow-hidden rounded-xl border bg-[#fcfbf8] text-start text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-background hover:shadow-md dark:bg-muted dark:hover:bg-muted/80 disabled:pointer-events-none disabled:opacity-50"
    >
      <div className="aspect-[3/2] w-full shrink-0 overflow-hidden bg-muted">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="size-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/35">
            <Package className="size-8" aria-hidden />
          </div>
        )}
      </div>
      <p className="line-clamp-2 px-2 py-1.5 text-center text-xs font-semibold leading-snug text-foreground sm:text-sm">
        {product.name}
      </p>
    </button>
  );
});

export function ProductGrid({
  disabled,
  onAddProduct,
  onPickProductWithVariants,
  branchId,
  inStockOnly,
}: ProductGridProps) {
  const [q, setQ] = useState('');

  const params = useMemo((): ListProductsParams => {
    const trimmed = q.trim();
    const bid = branchId != null && branchId > 0 ? branchId : undefined;
    const stockFilter = Boolean(inStockOnly && bid != null);
    const base: ListProductsParams = {
      limit: 60,
      offset: 0,
      status: 'active',
      ...(trimmed ? { q: trimmed } : {}),
    };
    if (stockFilter && bid != null) {
      return { ...base, branch_id: bid, in_stock_only: true };
    }
    return base;
  }, [q, branchId, inStockOnly]);
  const { data: products = [], isFetching } = useProducts(params, { enabled: !disabled });

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
      <div className="shrink-0">
        <div className="flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-input-background px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="ابحث بالاسم أو الكود أو الباركود"
            className="h-9 border-0 bg-transparent px-0 shadow-none outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-0.5 pt-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {products.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              disabled={!!disabled}
              onAddProduct={onAddProduct}
              onPickProductWithVariants={onPickProductWithVariants}
            />
          ))}
        </div>
        {!products.length ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            {isFetching ? '...' : 'لا توجد منتجات مطابقة'}
          </div>
        ) : null}
      </div>
    </section>
  );
}

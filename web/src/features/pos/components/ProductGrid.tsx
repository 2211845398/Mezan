import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProductRead } from '@/features/catalog/api';
import { type ListProductsParams, useProducts } from '@/features/catalog/queries';
import { formatCurrency } from '@/lib/format';

export type ProductGridProps = {
  disabled?: boolean;
  currency: string;
  onAddProduct: (productId: number, qty?: number) => void;
};

function productPrice(product: ProductRead): string | null {
  const attrs = product.attributes as { price?: unknown } | null | undefined;
  if (typeof attrs?.price === 'number') return String(attrs.price);
  if (typeof attrs?.price === 'string') return attrs.price;
  return null;
}

export function ProductGrid({ disabled, currency, onAddProduct }: ProductGridProps) {
  const [q, setQ] = useState('');

  const params = useMemo((): ListProductsParams => {
    const trimmed = q.trim();
    return {
      ...(trimmed ? { q: trimmed } : {}),
      limit: 60,
      offset: 0,
      status: 'active',
    };
  }, [q]);
  const { data: products = [], isFetching } = useProducts(params, { enabled: !disabled });

  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="ابحث بالاسم أو الكود أو الباركود"
          className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          disabled={disabled}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
          {products.map((product) => {
            const price = productPrice(product);
            return (
              <button
                key={product.id}
                type="button"
                disabled={disabled}
                onClick={() => onAddProduct(product.id, 1)}
                onDoubleClick={() => onAddProduct(product.id, 1)}
                className="group flex min-h-32 flex-col justify-between rounded-xl border bg-[#fcfbf8] p-3 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
              >
                <div className="space-y-1">
                  <p className="line-clamp-2 text-sm font-semibold">{product.name}</p>
                  <p className="text-[11px] text-muted-foreground" dir="ltr">
                    {product.sku}
                  </p>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {price ? formatCurrency(Number(price), currency) : '—'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3"
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddProduct(product.id, 1);
                    }}
                  >
                    +1
                  </Button>
                </div>
              </button>
            );
          })}
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

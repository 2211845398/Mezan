import type { QueryClient } from '@tanstack/react-query';

import type { ProductRead } from '@/features/catalog/api';
import { catalogKeys } from '@/features/catalog/queries';

import type { CartRead } from './api';

type CartLine = NonNullable<CartRead['lines']>[number];

function lineVariantId(l: CartLine): number | null | undefined {
  return (l as { variant_id?: number | null }).variant_id;
}

/**
 * Whether a negative-id optimistic row is already reflected by a confirmed server line.
 * Optimistic rows from the POS grid usually omit `variant_id` until the API responds; in that case
 * any server line for the same `product_id` supersedes the placeholder (avoids duplicate rows when keys were `3#` vs `3#<variant>`).
 */
export function isOptimisticLineSupersededByServer(
  pending: CartLine,
  serverLines: CartLine[] | undefined,
): boolean {
  if (pending.id >= 0) return true;
  const lines = serverLines ?? [];
  const pendingVariant = lineVariantId(pending);
  return lines.some((sl) => {
    if (sl.id <= 0) return false;
    if (sl.product_id !== pending.product_id) return false;
    const serverVariant = lineVariantId(sl);
    if (pendingVariant == null) return true;
    return serverVariant === pendingVariant;
  });
}

/**
 * Optimistic lines (negative id) still not represented on the server response.
 */
export function pendingOptimisticLinesAfterMerge(
  currentLines: CartRead['lines'] | undefined,
  serverLines: CartRead['lines'] | undefined,
): CartLine[] {
  const server = serverLines ?? [];
  return (currentLines ?? []).filter((l) => {
    if (l.id >= 0) return false;
    return !isOptimisticLineSupersededByServer(l, server);
  });
}

function q2(n: number): string {
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

/** Best-effort unit list price from catalog (may differ from POS active sell price until server responds). */
export function catalogListUnitPriceString(p: ProductRead): string {
  const attrs = p.attributes as { price?: number | string } | undefined;
  if (attrs && attrs.price != null && attrs.price !== '') {
    const n = typeof attrs.price === 'number' ? attrs.price : Number(attrs.price);
    if (Number.isFinite(n)) return q2(n);
  }
  return '0.00';
}

/** Normalize catalog `products` query cache: plain list (POS) or paged `{ items, total }` (catalog list). */
function catalogProductQueryRows(data: unknown): ProductRead[] | null {
  if (Array.isArray(data)) return data as ProductRead[];
  if (
    data &&
    typeof data === 'object' &&
    'items' in data &&
    Array.isArray((data as { items: unknown }).items)
  ) {
    return (data as { items: ProductRead[] }).items;
  }
  return null;
}

export function findProductInCatalogCache(qc: QueryClient, productId: number): ProductRead | undefined {
  const matches = qc.getQueriesData<unknown>({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] === catalogKeys.root[0] &&
      q.queryKey[1] === 'products',
  });
  for (const [, raw] of matches) {
    const rows = catalogProductQueryRows(raw);
    if (!rows?.length) continue;
    const hit = rows.find((p) => p.id === productId);
    if (hit) return hit;
  }
  const single = qc.getQueryData<ProductRead>(catalogKeys.product(productId));
  if (single?.id === productId) return single;
  return undefined;
}

/**
 * Mirrors `app/services/cart_service.py::_recalc_totals` (discount share + VAT on net after discount).
 * Used for optimistic POS cart updates so totals/lines stay coherent until the server responds.
 */
export function recalcApproxCartTotals(prev: CartRead, lines: CartLine[]): Pick<CartRead, 'subtotal' | 'tax_total' | 'total'> & { lines: CartLine[] } {
  const discount_total = Number.parseFloat(prev.discount_total ?? '0');
  if (!lines.length) {
    return {
      lines: [],
      subtotal: '0.00',
      tax_total: '0.00',
      total: q2(Math.max(0, 0 - discount_total)),
    };
  }

  const lineBases = lines.map((ln) => {
    const rateRaw = Number.parseFloat(String(ln.tax_rate ?? '0'));
    const rate = Math.min(1, Math.max(0, Number.isFinite(rateRaw) ? rateRaw : 0));
    const base = Number.parseFloat(ln.unit_price) * Number(ln.qty);
    const baseSafe = Number.isFinite(base) ? base : 0;
    return { ln: { ...ln }, base: baseSafe, rate };
  });

  for (const row of lineBases) {
    row.ln.line_total = q2(row.base);
    row.ln.line_tax_amount = '0.00';
  }

  const subtotal_net = q2(lineBases.reduce((s, x) => s + x.base, 0));
  const subNum = Number.parseFloat(subtotal_net);
  if (subNum <= 0) {
    return {
      lines: lineBases.map((x) => x.ln),
      subtotal: subtotal_net,
      tax_total: '0.00',
      total: q2(Math.max(0, subNum - discount_total)),
    };
  }

  const disc_eff = Math.min(discount_total, subNum);
  let tax_sum = 0;
  for (const row of lineBases) {
    const share = disc_eff * (row.base / subNum);
    const net_after = Math.max(0, row.base - share);
    const tax = net_after > 0 ? net_after * row.rate : 0;
    tax_sum += tax;
    row.ln.line_tax_amount = q2(tax);
  }

  const tax_total = q2(tax_sum);
  const total = q2(Math.max(0, subNum - discount_total + Number.parseFloat(tax_total)));

  return {
    lines: lineBases.map((x) => x.ln),
    subtotal: subtotal_net,
    tax_total,
    total,
  };
}

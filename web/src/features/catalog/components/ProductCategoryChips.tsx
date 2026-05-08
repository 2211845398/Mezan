import { TableCategoryTags } from '@/components/shared/TableCategoryTags';

import type { ProductRead } from '../api';

type ProductCategoryChipsProps = {
  product: ProductRead;
  nameById: Map<number, string>;
  className?: string;
};

const MAX_VISIBLE_CATEGORY_CHIPS = 2;

/**
 * Primary category + additional tag categories for catalog tables (`/catalog/products`).
 * Delegates rendering to {@link TableCategoryTags} for parity with inventory stock.
 */
export function ProductCategoryChips({ product, nameById, className }: ProductCategoryChipsProps) {
  const primary = product.category_id;
  const linked = product.category_ids?.length ? product.category_ids : [primary];
  const tags = linked.filter((id) => id !== primary);
  const extraSlots = Math.max(0, MAX_VISIBLE_CATEGORY_CHIPS - 1);
  const visibleTags = tags.slice(0, extraSlots);

  const fullListTitle = linked.map((id) => nameById.get(id) ?? String(id)).join(' · ');

  const labels: string[] = [String(nameById.get(primary) ?? primary)];
  for (const id of visibleTags) {
    labels.push(String(nameById.get(id) ?? id));
  }

  return <TableCategoryTags tags={labels} title={fullListTitle} className={className} />;
}

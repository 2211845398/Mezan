import { cn } from '@/lib/utils';

import type { ProductRead } from '../api';

type ProductCategoryChipsProps = {
  product: ProductRead;
  nameById: Map<number, string>;
  className?: string;
};

const MAX_VISIBLE_CATEGORY_CHIPS = 2;

/**
 * Primary category + additional tag categories for catalog tables.
 * Shows at most two chips total (primary + one tag when extras exist).
 */
export function ProductCategoryChips({ product, nameById, className }: ProductCategoryChipsProps) {
  const primary = product.category_id;
  const linked = product.category_ids?.length ? product.category_ids : [primary];
  const tags = linked.filter((id) => id !== primary);
  const extraSlots = Math.max(0, MAX_VISIBLE_CATEGORY_CHIPS - 1);
  const visibleTags = tags.slice(0, extraSlots);

  const fullListTitle = linked.map((id) => nameById.get(id) ?? String(id)).join(' · ');

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} title={fullListTitle}>
      <span
        className="max-w-[10rem] truncate rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-foreground"
        title={nameById.get(primary) ?? String(primary)}
      >
        {nameById.get(primary) ?? primary}
      </span>
      {visibleTags.map((id) => (
        <span
          key={id}
          className="max-w-[8rem] truncate rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          title={nameById.get(id) ?? String(id)}
        >
          {nameById.get(id) ?? id}
        </span>
      ))}
    </div>
  );
}

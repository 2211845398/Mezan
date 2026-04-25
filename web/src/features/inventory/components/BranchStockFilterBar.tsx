import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BranchRead } from '@/features/admin/types';

type BranchStockFilterBarProps = {
  branches: BranchRead[];
  branchId: number | null;
  onBranchId: (v: number | null) => void;
  categoryId: number | null;
  onCategoryId: (v: number | null) => void;
  /** Flat category list for simple filter. */
  categories: { id: number; name: string }[];
};

/**
 * Standard branch + category filter strip for `StockOnHand` and similar screens.
 */
export function BranchStockFilterBar({
  branches,
  branchId,
  onBranchId,
  categoryId,
  onCategoryId,
  categories,
}: BranchStockFilterBarProps) {
  const { t } = useTranslation('inventory');
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-40 space-y-1">
        <Label>{t('stock.filter.branch')}</Label>
        <Select
          value={branchId == null ? 'all' : String(branchId)}
          onValueChange={(v) => onBranchId(v === 'all' ? null : Number(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('stock.filter.all_branches')}</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-40 space-y-1">
        <Label>{t('stock.filter.category')}</Label>
        <Select
          value={categoryId == null ? 'all' : String(categoryId)}
          onValueChange={(v) => onCategoryId(v === 'all' ? null : Number(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('stock.filter.all_categories')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

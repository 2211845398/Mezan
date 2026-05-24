import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { CategoryCombobox, type CategoryOption } from '@/features/catalog/components/CategoryCombobox';

type BranchStockFilterBarProps = {
  branchId: number | null;
  onBranchId: (v: number | null) => void;
  categoryId: number | null;
  onCategoryId: (v: number | null) => void;
  categories: { id: number; name: string }[];
  status: string;
  onStatus: (v: string) => void;
};

const STATUS_VALUES = ['all', 'ok', 'below_reorder', 'out_of_stock', 'none'] as const;

/**
 * Branch + category + reorder status filter strip for `StockOnHand`.
 */
export function BranchStockFilterBar({
  branchId,
  onBranchId,
  categoryId,
  onCategoryId,
  categories,
  status,
  onStatus,
}: BranchStockFilterBarProps) {
  const { t } = useTranslation('inventory');
  const categoryOptions: CategoryOption[] = categories.map((c) => ({
    id: c.id,
    label: c.name,
  }));

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-[12rem] flex-1 space-y-1">
        <BranchCombobox
          label={t('stock.filter.branch')}
          value={branchId}
          onChange={onBranchId}
          allowClear
          clearLabel={t('stock.filter.all_branches')}
        />
      </div>
      <div className="min-w-[12rem] flex-1 space-y-1">
        <Label className="text-sm">{t('stock.filter.category')}</Label>
        <CategoryCombobox
          value={categoryId}
          onChange={onCategoryId}
          options={categoryOptions}
          allowAll
        />
      </div>
      <div className="min-w-[10rem] space-y-1">
        <Label>{t('stock.filter.status')}</Label>
        <Select value={status || 'all'} onValueChange={onStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`stock.filter.status_${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

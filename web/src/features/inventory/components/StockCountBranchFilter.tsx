import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';

type StockCountBranchFilterProps = {
  id?: string;
  value: number | null;
  onChange: (branchId: number | null) => void;
};

/** Branch filter for stock-count list toolbar (same row as density / columns). */
export function StockCountBranchFilter({ id = 'stock-count-branch-filter', value, onChange }: StockCountBranchFilterProps) {
  const { t } = useTranslation('inventory');

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t('stock.filter.branch')}</Label>
      <BranchCombobox
        id={id}
        value={value}
        onChange={onChange}
        allowClear
        clearLabel={t('stock.filter.all_branches')}
        showCode={false}
      />
    </div>
  );
}

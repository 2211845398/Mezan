import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/ContentSurface';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { CategoryCombobox, type CategoryOption } from '@/features/catalog/components/CategoryCombobox';
import { useCategoryTreeQuery } from '@/features/catalog/queries';
import { ProductSearch } from '@/features/pos/components/ProductSearch';

import { WarehouseManagerCombobox } from '../../components/WarehouseManagerCombobox';
import { downloadStockCountPdf } from '../../api';

function flattenCats(nodes: { id: number; name: string; children?: typeof nodes }[]): CategoryOption[] {
  const o: CategoryOption[] = [];
  for (const n of nodes) {
    o.push({ id: n.id, label: n.name });
    if (n.children?.length) o.push(...flattenCats(n.children));
  }
  return o;
}

export default function StockCountPage() {
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { data: tree = [] } = useCategoryTreeQuery();
  const cats = flattenCats(tree);

  const [branchId, setBranchId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [responsible, setResponsible] = useState('');
  const [productId, setProductId] = useState<number | null>(null);

  const exportM = useMutation({
    mutationFn: async () => {
      if (branchId == null) throw new Error('branch');
      return downloadStockCountPdf({
        branch_id: branchId,
        category_id: categoryId,
        product_ids: productId != null && productId > 0 ? [productId] : null,
        q: null,
        responsible_name: responsible.trim(),
      });
    },
    onSuccess: (filename) => {
      toast.success(t('movement.stock_count.exported', { filename }));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('movement.stock_count.title')}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/inventory/stock')}>
            {tc('actions.back')}
          </Button>
        }
      />
      <SectionCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <BranchCombobox
            label={t('adjustments.field.branch')}
            value={branchId}
            onChange={setBranchId}
          />
          <div>
            <Label className="text-sm">{t('stock.filter.category')}</Label>
            <CategoryCombobox
              value={categoryId}
              onChange={setCategoryId}
              options={cats}
              allowAll
            />
          </div>
          <WarehouseManagerCombobox
            label={t('movement.stock_count.responsible')}
            value={responsible}
            onChange={setResponsible}
          />
          <div>
            <Label>{t('stock.search.label')}</Label>
            <ProductSearch
              clearable
              value={productId != null && productId > 0 ? String(productId) : undefined}
              onChange={setProductId}
            />
          </div>
        </div>
        <div className="mt-4">
          <Button
            type="button"
            disabled={exportM.isPending || branchId == null}
            onClick={() => void exportM.mutate()}
          >
            {t('movement.stock_count.export')}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

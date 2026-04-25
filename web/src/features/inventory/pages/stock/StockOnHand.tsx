import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { useCategoryTreeQuery } from '@/features/catalog/queries';

import type { StockOnHandRow } from '../../api';
import { BranchStockFilterBar } from '../../components/BranchStockFilterBar';
import { useStockOnHandQuery } from '../../queries';

function flattenCats(nodes: { id: number; name: string; children?: typeof nodes }[]): { id: number; name: string }[] {
  const o: { id: number; name: string }[] = [];
  for (const n of nodes) {
    o.push({ id: n.id, name: n.name });
    if (n.children?.length) {
      o.push(...flattenCats(n.children));
    }
  }
  return o;
}

export default function StockOnHand() {
  const { t } = useTranslation('inventory');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: tree = [] } = useCategoryTreeQuery();
  const cats = useMemo(() => flattenCats(tree), [tree]);
  const { data: rows = [], isLoading, isError, refetch } = useStockOnHandQuery({
    ...(branchId != null ? { branch_id: branchId } : {}),
    ...(categoryId != null ? { category_id: categoryId } : {}),
    limit: 2000,
    offset: 0,
  });

  const columns = useMemo(
    () =>
      defineColumns<StockOnHandRow>()([
        { id: 'branch', header: t('stock.col.branch'), cell: ({ row }) => row.original.branch_id },
        { id: 'sku', accessorKey: 'sku', header: t('stock.col.sku') },
        { id: 'name', accessorKey: 'product_name', header: t('stock.col.product') },
        { id: 'cat', accessorKey: 'category_name', header: t('stock.col.category') },
        { id: 'qty', accessorKey: 'on_hand', header: t('stock.col.qty') },
        { id: 'uc', accessorKey: 'unit_cost', header: t('stock.col.unit_cost') },
        { id: 'ext', accessorKey: 'extended_cost', header: t('stock.col.extended') },
      ]),
    [t],
  );

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('stock.title')}</h1>
      <p className="text-xs text-muted-foreground">{t('stock.wavg_note')}</p>
      <BranchStockFilterBar
        branches={branches}
        branchId={branchId}
        onBranchId={setBranchId}
        categoryId={categoryId}
        onCategoryId={setCategoryId}
        categories={cats}
      />
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}

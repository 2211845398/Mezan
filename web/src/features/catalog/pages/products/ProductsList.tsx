import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';
import { formatNumber } from '@/lib/format';

import { getBarcodeCount, getDisplayPrice, type ProductRead } from '../../api';
import { catalogKeys, useCategoryTreeQuery, useProductListQuery } from '../../queries';
import { ProductFormSheet } from './ProductForm';

function flattenCategoryTree(
  nodes: { id: number; name: string; children?: typeof nodes }[],
): { id: number; name: string }[] {
  const o: { id: number; name: string }[] = [];
  for (const n of nodes) {
    o.push({ id: n.id, name: n.name });
    if (n.children?.length) {
      o.push(...flattenCategoryTree(n.children));
    }
  }
  return o;
}

export default function ProductsList() {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const canUpdate = usePermission('catalog', 'update');
  const canCreate = usePermission('catalog', 'create');
  const [status, setStatus] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const { data: treeData = [] } = useCategoryTreeQuery();
  const categoryOptions = useMemo(() => flattenCategoryTree(treeData), [treeData]);
  const [editorId, setEditorId] = useState<number | 'new' | null>(null);
  const { data: rows = [], isLoading, isError, refetch } = useProductListQuery({
    limit: 2000,
    offset: 0,
    ...(status ? { status } : {}),
    ...(categoryId != null ? { category_id: categoryId } : {}),
  });

  const categoryNameById = useMemo(
    () => new Map(categoryOptions.map((c) => [c.id, c.name] as const)),
    [categoryOptions],
  );

  const columns = useMemo(
    () =>
      defineColumns<ProductRead>()([
        { id: 'sku', accessorKey: 'sku', header: t('products.col.sku') },
        { id: 'name', accessorKey: 'name', header: t('products.col.name') },
        {
          id: 'category',
          header: t('products.col.category'),
          cell: ({ row }) => categoryNameById.get(row.original.category_id) ?? '—',
        },
        {
          id: 'barcode_count',
          header: t('products.col.barcode_count'),
          cell: ({ row }) => formatNumber(getBarcodeCount(row.original)),
        },
        {
          id: 'default_price',
          header: t('products.col.default_price'),
          cell: ({ row }) => getDisplayPrice(row.original),
        },
        {
          id: 'status',
          header: t('products.col.status'),
          cell: ({ row }) => t(`products.status.${row.original.status === 'archived' ? 'archived' : 'active'}`),
        },
        {
          id: 'vat',
          header: t('products.col.vat'),
          cell: ({ row }) => String(row.original.output_vat_rate ?? '0'),
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            canUpdate ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setEditorId(row.original.id)}
                aria-label={t('products.edit')}
              >
                <Pencil className="size-4" />
              </Button>
            ) : null,
        },
      ]),
    [t, canUpdate, categoryNameById],
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('products.title')}</h1>
        {canCreate ? (
          <Button type="button" onClick={() => setEditorId('new')}>
            <Plus className="me-1 size-4" />
            {t('products.create')}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="min-w-40 space-y-1">
          <Label>{t('products.filter.status')}</Label>
          <Select value={status ?? 'all'} onValueChange={(v) => setStatus(v === 'all' ? null : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('products.filter.all')}</SelectItem>
              <SelectItem value="active">{t('products.status.active')}</SelectItem>
              <SelectItem value="archived">{t('products.status.archived')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-40 space-y-1">
          <Label>{t('products.filter.category')}</Label>
          <Select
            value={categoryId == null ? 'all' : String(categoryId)}
            onValueChange={(v) => setCategoryId(v === 'all' ? null : Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('products.filter.all')}</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => {
          void refetch();
        }}
        toolbarExtras={<p className="text-xs text-muted-foreground">{t('products.list_note')}</p>}
      />
      {editorId != null ? (
        <ProductFormSheet
          productId={editorId === 'new' ? null : editorId}
          onClose={() => {
            setEditorId(null);
            void qc.invalidateQueries({ queryKey: catalogKeys.root });
          }}
        />
      ) : null}
    </div>
  );
}

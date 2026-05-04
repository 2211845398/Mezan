import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DangerConfirmDialog } from '@/features/admin/components/DangerConfirmDialog';
import { usePermission } from '@/hooks/usePermission';
import { formatNumber } from '@/lib/format';
import { notify } from '@/lib/toast';

import {
  getBarcodeCount,
  getDisplayPrice,
  postArchiveProduct,
  postUnarchiveProduct,
  type ProductRead,
} from '../../api';
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
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const canUpdate = usePermission('catalog', 'update');
  const canCreate = usePermission('catalog', 'create');
  const [status, setStatus] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const { data: treeData = [] } = useCategoryTreeQuery();
  const categoryOptions = useMemo(() => flattenCategoryTree(treeData), [treeData]);
  const [editorId, setEditorId] = useState<number | 'new' | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProductRead | null>(null);
  const archiveProduct = useMutation({
    mutationFn: async (row: ProductRead) =>
      row.status === 'archived' ? postUnarchiveProduct(row.id) : postArchiveProduct(row.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: catalogKeys.root });
    },
  });
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
          cell: ({ row }) => {
            const product = row.original;
            const archived = product.status === 'archived';
            return canUpdate ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditorId(product.id)}
                  aria-label={t('products.edit')}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setArchiveTarget(product)}
                  disabled={archiveProduct.isPending}
                  aria-label={archived ? t('products.unarchive') : t('products.archive')}
                >
                  {archived ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
                </Button>
              </div>
            ) : null;
          },
        },
      ]),
    [t, canUpdate, categoryNameById, archiveProduct],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('products.title')}
        actions={
          <Button type="button" onClick={() => setEditorId('new')} disabled={!canCreate}>
            {t('products.create')}
          </Button>
        }
      />
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
      <DangerConfirmDialog
        open={archiveTarget != null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={
          archiveTarget?.status === 'archived' ? t('products.unarchive') : t('products.archive')
        }
        description={t('products.archive_desc')}
        confirmKeyword="DELETE"
        isLoading={archiveProduct.isPending}
        onConfirm={async () => {
          if (!archiveTarget) return;
          const wasArchived = archiveTarget.status === 'archived';
          try {
            await archiveProduct.mutateAsync(archiveTarget);
            notify.success(wasArchived ? tc('toasts.restored') : tc('toasts.archived'));
            setArchiveTarget(null);
          } catch (error) {
            notifyApiError(error, t('errors.generic'));
          }
        }}
      />
    </div>
  );
}

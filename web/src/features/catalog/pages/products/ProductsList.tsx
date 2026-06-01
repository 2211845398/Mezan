import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePermission } from '@/hooks/usePermission';

import { listTaxDefinitions, postArchiveProduct, postUnarchiveProduct, type ProductRead } from '../../api';
import { CategoryCombobox } from '../../components/CategoryCombobox';
import { ProductCategoryChips } from '../../components/ProductCategoryChips';
import { ProductTaxChips } from '../../components/ProductTaxChips';
import { catalogKeys, useCategoryTreeQuery, useProductListQuery } from '../../queries';

function flattenCategoryTree(
  nodes: { id: number; name: string; is_active?: boolean; children?: typeof nodes }[],
): { id: number; name: string }[] {
  const o: { id: number; name: string }[] = [];
  for (const n of nodes) {
    if (n.is_active === false) continue;
    o.push({ id: n.id, name: n.name });
    if (n.children?.length) {
      o.push(...flattenCategoryTree(n.children));
    }
  }
  return o;
}

const PAGE_SIZE = 50;

export default function ProductsList() {
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const canUpdate = usePermission('catalog', 'update');
  const canCreate = usePermission('catalog', 'create');

  const [status, setStatus] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProductRead | null>(null);

  const categoryId = useMemo(() => {
    const raw = searchParams.get('category_id');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const categorySubtree = searchParams.get('category_subtree') === '1';
  const qRaw = searchParams.get('q') ?? '';
  const q = qRaw.trim();
  const [searchDraft, setSearchDraft] = useState(qRaw);

  useEffect(() => {
    setSearchDraft(qRaw);
  }, [qRaw]);

  const pageSize = useMemo(() => {
    const raw = searchParams.get('pageSize');
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : PAGE_SIZE;
  }, [searchParams]);

  const tablePage = useMemo(() => {
    const raw = searchParams.get('page');
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [searchParams]);

  const offset = (tablePage - 1) * pageSize;

  const setQuery = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === undefined || v === '') {
            next.delete(k);
          } else {
            next.set(k, v);
          }
        }
        return next;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    const trimmed = searchDraft.trim();
    if (trimmed === q) return;
    const id = window.setTimeout(() => {
      setQuery({ q: trimmed || null, page: null });
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchDraft, q, setQuery]);

  useEffect(() => {
    if (!searchParams.get('p')) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('p');
      return next;
    });
  }, [searchParams, setSearchParams]);

  const { data: treeData = [] } = useCategoryTreeQuery();
  const categoryOptions = useMemo(() => flattenCategoryTree(treeData), [treeData]);

  const { data: taxDefinitions = [] } = useQuery({
    queryKey: [...catalogKeys.root, 'taxDefinitions', 'active'],
    queryFn: () => listTaxDefinitions(true),
  });
  const taxById = useMemo(
    () => new Map(taxDefinitions.map((d) => [d.id, d] as const)),
    [taxDefinitions],
  );

  const archiveProduct = useMutation({
    mutationFn: async (row: ProductRead) =>
      row.status === 'archived' ? postUnarchiveProduct(row.id) : postArchiveProduct(row.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: catalogKeys.root });
    },
  });

  const { data, isLoading, isError, refetch } = useProductListQuery({
    limit: pageSize,
    offset,
    ...(status ? { status } : {}),
    ...(categoryId != null ? { category_id: categoryId } : {}),
    ...(categoryId != null && categorySubtree ? { category_include_descendants: true } : {}),
    ...(q !== '' ? { q } : {}),
  });

  const rows = data?.items ?? [];
  const totalRows = data?.total ?? 0;

  useEffect(() => {
    if (isLoading || isError) return;
    if (rows.length === 0 && tablePage > 1) {
      setQuery({ page: null });
    }
  }, [isLoading, isError, rows.length, tablePage, setQuery]);

  const categoryNameById = useMemo(
    () => new Map(categoryOptions.map((c) => [c.id, c.name] as const)),
    [categoryOptions],
  );

  const columns = useMemo(
    () =>
      defineColumns<ProductRead>()([
        {
          id: 'name',
          header: t('products.col.name'),
          cell: ({ row }) => {
            const p = row.original;
            const img = p.image_url;
            return (
              <div className="flex min-w-0 items-center gap-2">
                <div className="size-9 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {img ? (
                    <img src={img} alt="" className="size-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <span className="truncate font-medium">{p.name}</span>
              </div>
            );
          },
        },
        {
          id: 'categories',
          header: t('products.col.categories'),
          cell: ({ row }) => (
            <ProductCategoryChips product={row.original} nameById={categoryNameById} />
          ),
        },
        {
          id: 'variants',
          header: t('products.col.variants'),
          cell: ({ row }) => (
            <span className="num-latin tabular-nums" dir="ltr">
              {row.original.variant_count ?? 0}
            </span>
          ),
        },
        {
          id: 'status',
          header: t('products.col.status'),
          cell: ({ row }) => t(`products.status.${row.original.status === 'archived' ? 'archived' : 'active'}`),
        },
        {
          id: 'vat',
          header: t('products.col.vat'),
          cell: ({ row }) => (
            <ProductTaxChips
              taxDefinitionIds={row.original.tax_definition_ids}
              outputVatRate={row.original.output_vat_rate}
              taxById={taxById}
            />
          ),
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
                  onClick={() => navigate(`/catalog/products/${product.id}/edit`)}
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
    [t, canUpdate, categoryNameById, taxById, archiveProduct, navigate],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('products.title')}
        actions={
          <Button type="button" onClick={() => navigate('/catalog/products/new')} disabled={!canCreate}>
            {t('products.create')}
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="product-search">{t('products.filter.search')}</Label>
          <Input
            id="product-search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={t('products.filter.search_ph')}
          />
        </div>
        <div className="min-w-40 space-y-1">
          <Label>{t('products.filter.status')}</Label>
          <Select
            value={status ?? 'all'}
            onValueChange={(v) => {
              setStatus(v === 'all' ? null : v);
              setQuery({ page: null });
            }}
          >
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
        <div className="min-w-48 space-y-1">
          <Label>{t('products.filter.category')}</Label>
          <CategoryCombobox
            value={categoryId}
            onChange={(id) => {
              if (id == null) {
                setQuery({ category_id: null, category_subtree: null, page: null });
              } else {
                setQuery({
                  category_id: String(id),
                  category_subtree: categorySubtree ? '1' : null,
                  page: null,
                });
              }
            }}
            options={categoryOptions.map((c) => ({ id: c.id, label: c.name }))}
            allowAll
            allLabel={t('products.filter.all')}
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="subtree"
            checked={categorySubtree}
            disabled={categoryId == null}
            onCheckedChange={(on) => setQuery({ category_subtree: on ? '1' : null, page: null })}
          />
          <Label htmlFor="subtree" className="text-sm font-normal">
            {t('products.filter.include_subcategories')}
          </Label>
        </div>
      </div>
      <DataTable
        mode="server"
        showSearch={false}
        totalRows={totalRows}
        defaultUrlQuery={{ pageSize: PAGE_SIZE }}
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => {
          void refetch();
        }}
      />
      <AlertDialog
        open={archiveTarget != null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.status === 'archived' ? t('products.unarchive') : t('products.archive')}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('products.archive_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={archiveProduct.isPending}
              onClick={async () => {
                if (!archiveTarget) return;
                try {
                  await archiveProduct.mutateAsync(archiveTarget);
                  setArchiveTarget(null);
                  toast.success(t('products.status_updated'));
                } catch (e) {
                  notifyApiError(e, t('errors.generic'));
                }
              }}
            >
              {archiveTarget?.status === 'archived' ? t('products.unarchive') : t('products.archive')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

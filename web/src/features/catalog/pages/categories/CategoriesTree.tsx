import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Eye, EyeOff, FolderTree, ImageIcon, Package, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePermission } from '@/hooks/usePermission';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';

import { type CategoryTreeNode, updateCategory } from '../../api';
import { CategoryCreateDialog } from '../../components/CategoryCreateDialog';
import { catalogKeys, useCategoryTreeQuery } from '../../queries';
import { filterActiveCategoryTree } from '../../utils/categoryTree';

function indexCategoriesById(nodes: CategoryTreeNode[]): Map<number, CategoryTreeNode> {
  const map = new Map<number, CategoryTreeNode>();
  const walk = (n: CategoryTreeNode) => {
    map.set(n.id, n);
    (n.children ?? []).forEach(walk);
  };
  nodes.forEach(walk);
  return map;
}

type CreateParentMode = 'path' | number;

export default function CategoriesTree() {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const canCreate = usePermission('catalog', 'create');
  const canUpdate = usePermission('catalog', 'update');
  const { data: treeRaw = [], isLoading, isFetching, refetch } = useCategoryTreeQuery();
  const [showHidden, setShowHidden] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const tree = useMemo(
    () => (showHidden ? treeRaw : filterActiveCategoryTree(treeRaw)),
    [treeRaw, showHidden],
  );

  const [path, setPath] = useState<number[]>([]);
  const byId = useMemo(() => indexCategoriesById(tree), [tree]);

  const currentParentId = path.length === 0 ? null : path[path.length - 1] ?? null;
  const currentChildren = useMemo(() => {
    if (path.length === 0) return tree;
    const node = byId.get(path[path.length - 1]!);
    return node?.children ?? [];
  }, [byId, path, tree]);

  const filteredChildren = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return currentChildren;
    return currentChildren.filter(
      (node) => node.name.toLowerCase().includes(q) || node.slug.toLowerCase().includes(q),
    );
  }, [categorySearch, currentChildren]);

  const breadcrumbs = useMemo(() => {
    const parts: { id: number | null; name: string }[] = [{ id: null, name: t('categories.browse_root') }];
    for (const id of path) {
      const n = byId.get(id);
      if (n) parts.push({ id: n.id, name: n.name });
    }
    return parts;
  }, [byId, path, t]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createParentMode, setCreateParentMode] = useState<CreateParentMode>('path');

  const resolvedCreateParentId = createParentMode === 'path' ? currentParentId : createParentMode;

  const openCreateFromHeader = useCallback(() => {
    setCreateParentMode('path');
    setCreateOpen(true);
  }, []);

  const openCreateUnder = useCallback((parentId: number) => {
    setCreateParentMode(parentId);
    setCreateOpen(true);
  }, []);

  const toggleActiveM = useMutation({
    mutationFn: ({ id, next }: { id: number; next: boolean }) => updateCategory(id, { is_active: next }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('categories.visibility_updated'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const enterCategory = (id: number) => {
    setPath((p) => [...p, id]);
    setCategorySearch('');
  };

  const goToCrumb = (idx: number) => {
    if (idx < 0) return;
    setPath((p) => p.slice(0, idx));
    setCategorySearch('');
  };

  const searchHasNoResults =
    !isLoading && currentChildren.length > 0 && filteredChildren.length === 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={t('categories.title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canCreate ? (
              <Button type="button" onClick={openCreateFromHeader}>
                <Plus className="me-1 size-4" />
                {currentParentId == null ? t('categories.add_root') : t('categories.child')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => void refetch()}
              disabled={isFetching}
              title={t('actions.refresh')}
              aria-label={t('actions.refresh')}
            >
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      <nav
        aria-label="breadcrumb"
        className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
      >
        {breadcrumbs.map((crumb, idx) => (
          <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
            {idx > 0 ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden /> : null}
            <button
              type="button"
              className={cn(
                'rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted',
                idx === breadcrumbs.length - 1 ? 'text-foreground' : 'text-muted-foreground',
              )}
              onClick={() => goToCrumb(idx)}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      {!isLoading ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          <Input
            id="category-search"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder={t('categories.search_ph')}
            aria-label={t('categories.search_label')}
            className="h-9 min-w-[12rem] max-w-md sm:max-w-md"
          />
          <div className="flex shrink-0 items-center gap-2">
            <Switch id="show-hidden" checked={showHidden} onCheckedChange={setShowHidden} />
            <Label htmlFor="show-hidden" className="shrink-0 text-sm font-normal whitespace-nowrap">
              {t('categories.show_hidden')}
            </Label>
          </div>
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}

      {searchHasNoResults ? (
        <p className="text-sm text-muted-foreground">{t('categories.search_empty')}</p>
      ) : null}

      {!isLoading && currentChildren.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {currentParentId == null ? t('categories.browse_empty_root') : t('categories.browse_empty')}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {canCreate ? (
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={openCreateFromHeader}>
                <Plus className="me-1 size-3" />
                {currentParentId == null ? t('categories.add_root') : t('categories.child')}
              </Button>
            ) : null}
            {currentParentId != null ? (
              <Button type="button" variant="outline" size="sm" className="h-7" asChild>
                <Link to={`/catalog/products?category_id=${currentParentId}&category_subtree=1`}>
                  <Package className="me-1 size-3" />
                  {t('categories.view_products')}
                </Link>
              </Button>
            ) : null}
            {currentParentId != null ? (
              <Button type="button" variant="outline" size="sm" className="h-7" asChild>
                <Link to={`/catalog/categories/${currentParentId}`}>{t('categories.details')}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isLoading && filteredChildren.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredChildren.map((node) => (
            <Card
              key={node.id}
              role="button"
              tabIndex={0}
              className={cn(
                'cursor-pointer overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !node.is_active && 'opacity-80 ring-1 ring-muted-foreground/30',
              )}
              onClick={() => enterCategory(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  enterCategory(node.id);
                }
              }}
            >
              <div className="relative aspect-[3/2] w-full bg-muted">
                {node.image_url ? (
                  <img
                    src={resolveMediaUrl(node.image_url) ?? node.image_url}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-8 opacity-50" aria-hidden />
                  </div>
                )}
                {!node.is_active ? (
                  <div className="absolute start-2 top-2">
                    <span className="inline-flex items-center rounded-md border-2 border-[hsl(var(--ring))] bg-background px-2 py-0.5 text-xs font-semibold text-foreground shadow-sm">
                      {t('categories.hidden_badge')}
                    </span>
                  </div>
                ) : null}
              </div>
              <CardContent className="space-y-1.5 p-3">
                <p className="line-clamp-2 font-semibold leading-tight">{node.name}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {t('categories.card_children', { count: node.children?.length ?? 0 })}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {t('categories.card_products', { count: node.direct_product_count ?? 0 })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {canCreate ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreateUnder(node.id);
                      }}
                    >
                      <Plus className="me-1 size-3" />
                      {t('categories.child')}
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" className="h-7" asChild>
                    <Link to={`/catalog/categories/${node.id}`} onClick={(e) => e.stopPropagation()}>
                      {t('categories.details')}
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7" asChild>
                    <Link to={`/catalog/products?category_id=${node.id}&category_subtree=1`} onClick={(e) => e.stopPropagation()}>
                      <Package className="me-1 size-3" />
                      {t('categories.view_products')}
                    </Link>
                  </Button>
                  {canUpdate ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleActiveM.mutate({ id: node.id, next: !node.is_active });
                      }}
                      disabled={toggleActiveM.isPending}
                      aria-label={node.is_active ? t('categories.hide') : t('categories.show')}
                    >
                      {node.is_active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
        <FolderTree className="size-4" aria-hidden />
        <span>{t('categories.browse_tree_hint')}</span>
      </div>

      <CategoryCreateDialog open={createOpen} onOpenChange={setCreateOpen} parentId={resolvedCreateParentId} />
    </div>
  );
}

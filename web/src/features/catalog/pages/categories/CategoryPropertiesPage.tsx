import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderTree, ImageIcon, LayoutGrid, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { PageTabNav } from '@/components/shared/PageTabNav';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
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
import { usePermission } from '@/hooks/usePermission';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import RouteLoader from '@/routes/RouteLoader';

import { updateCategory } from '../../api';
import { CategoryCreateDialog } from '../../components/CategoryCreateDialog';
import { CategoryImageUploadField } from '../../components/CategoryImageUploadField';
import {
  catalogKeys,
  useCategoriesQuery,
  useCategoryQuery,
  useCategoryTreeQuery,
} from '../../queries';
import { findCategoryNode } from '../../utils/categoryTree';

type TabId = 'overview' | 'children';

export default function CategoryPropertiesPage() {
  const { categoryId: categoryIdParam } = useParams<{ categoryId: string }>();
  const { t, i18n } = useTranslation('catalog');
  const qc = useQueryClient();
  const canRead = usePermission('catalog', 'read');
  const canUpdate = usePermission('catalog', 'update');

  const categoryIdNum = Number(categoryIdParam);
  const idOk = Number.isFinite(categoryIdNum) && categoryIdNum > 0;

  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<TabId>(initialTab === 'children' ? 'children' : 'overview');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tree = [] } = useCategoryTreeQuery();
  const { data: category, isLoading: loadingCat, isError } = useCategoryQuery(idOk ? categoryIdNum : null);
  const { data: children = [], isLoading: loadingChildren } = useCategoriesQuery(idOk ? categoryIdNum : null, {
    enabled: idOk,
  });
  const node = useMemo(() => (idOk ? findCategoryNode(tree, categoryIdNum) : null), [tree, categoryIdNum, idOk]);

  const parentName = useMemo(() => {
    if (!category?.parent_id) return null;
    const p = findCategoryNode(tree, category.parent_id);
    return p?.name ?? `#${category.parent_id}`;
  }, [category, tree]);

  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);

  const previewSrc = useMemo(() => resolveMediaUrl(imageUrl.trim() || undefined), [imageUrl]);

  useEffect(() => {
    if (!category) return;
    setName(category.name);
    setImageUrl(category.image_url ?? '');
    setIsActive(category.is_active);
  }, [category]);

  useEffect(() => {
    setCreateOpen(false);
  }, [categoryIdNum]);

  const saveMeta = useMutation({
    mutationFn: () =>
      updateCategory(categoryIdNum, {
        name: name.trim(),
        image_url: imageUrl.trim() === '' ? null : imageUrl.trim(),
        is_active: isActive,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('categories.detail_saved'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  if (!canRead) {
    return (
      <div className="p-6">
        <PageHeader title={t('categories.title')} actions={<BackButton to="/catalog/categories" label={t('categories.title')} />} />
        <p className="mt-4 text-sm text-muted-foreground">{t('products.no_permission')}</p>
      </div>
    );
  }

  if (!idOk || isError) {
    return (
      <div className="p-6">
        <PageHeader title={t('categories.detail_title')} actions={<BackButton to="/catalog/categories" label={t('categories.title')} />} />
        <p className="mt-4 text-sm text-destructive">{t('errors.not_found')}</p>
      </div>
    );
  }

  if (loadingCat || !category) {
    return <RouteLoader />;
  }

  const tabs = [
    { id: 'overview' as const, label: t('categories.detail_tab_overview'), icon: LayoutGrid },
    { id: 'children' as const, label: t('categories.detail_tab_children'), icon: FolderTree },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={category.name}
        actions={<BackButton to="/catalog/categories" label={t('categories.title')} />}
      />

      <PageTabNav
        mode="button"
        items={tabs}
        activeId={tab}
        onSelect={(id) => setTab(id as TabId)}
      />

      {tab === 'overview' ? (
        <SectionCard title={t('categories.detail_tab_overview')} contentClassName="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-6">
            <div className="flex flex-col gap-4 lg:h-full">
              <div className="rounded-lg border bg-muted/15 p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-sm">{t('categories.field.name')}</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!canUpdate}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">{t('categories.field.slug')}</Label>
                    <Input
                      value={category.slug}
                      readOnly
                      disabled
                      className="h-9 bg-muted font-mono text-sm text-muted-foreground"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-sm">{t('categories.field.status')}</Label>
                    <Select
                      value={isActive ? 'active' : 'archived'}
                      onValueChange={(v) => setIsActive(v === 'active')}
                      disabled={!canUpdate}
                    >
                      <SelectTrigger dir={i18n.dir()} className="h-9 w-full text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir={i18n.dir()}>
                        <SelectItem value="active">{t('categories.field.active_state_on')}</SelectItem>
                        <SelectItem value="archived">{t('categories.field.active_state_off')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">{t('categories.field.image_upload')}</Label>
                    <CategoryImageUploadField
                      value={imageUrl}
                      onChange={setImageUrl}
                      disabled={!canUpdate}
                      inputId="category-detail-image"
                      layout="controls-only"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/15 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('categories.detail_parent')}</p>
                  <p className="font-medium">
                    {category.parent_id != null && parentName ? (
                      <Link
                        to={`/catalog/categories/${category.parent_id}`}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {parentName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
                <dl className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
                    <dt className="text-muted-foreground">{t('categories.detail_subcategories_label')}</dt>
                    <dd className="font-medium num-latin">{node?.children?.length ?? children.length}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
                    <dt className="text-muted-foreground">{t('categories.detail_products_direct_label')}</dt>
                    <dd className="font-medium num-latin">{node?.direct_product_count ?? 0}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="relative min-h-[12rem] overflow-hidden rounded-lg border bg-muted lg:min-h-0 lg:h-full">
              {previewSrc ? (
                <img src={previewSrc} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 p-6 text-muted-foreground lg:min-h-0">
                  <ImageIcon className="size-14 opacity-40" aria-hidden />
                  <p className="text-sm">{t('categories.field.image_upload')}</p>
                </div>
              )}
            </div>
          </div>

          {canUpdate ? (
            <div className="flex justify-end border-t pt-4">
              <Button type="button" onClick={() => void saveMeta.mutate()} disabled={saveMeta.isPending}>
                {t('actions.save')}
              </Button>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {tab === 'children' ? (
        <SectionCard
          title={t('categories.detail_tab_children')}
          actions={
            canUpdate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus className="me-1 size-4" />
                {t('categories.child')}
              </Button>
            ) : null
          }
        >
          {loadingChildren ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
          {!loadingChildren && children.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('categories.browse_empty')}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((c) => (
              <Link
                key={c.id}
                to={`/catalog/categories/${c.id}`}
                className="rounded-lg border p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-tight">{c.name}</p>
                  {!c.is_active ? <Badge variant="secondary">{t('categories.hidden_badge')}</Badge> : null}
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{c.slug}</p>
              </Link>
            ))}
          </div>
          <CategoryCreateDialog open={createOpen} onOpenChange={setCreateOpen} parentId={categoryIdNum} />
        </SectionCard>
      ) : null}

    </div>
  );
}

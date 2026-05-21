import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePermission } from '@/hooks/usePermission';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';
import RouteLoader from '@/routes/RouteLoader';

import { updateCategory } from '../../api';
import { CategoryAttributeForm } from '../../components/CategoryAttributeForm';
import { CategoryCreateDialog } from '../../components/CategoryCreateDialog';
import { CategoryImageUploadField } from '../../components/CategoryImageUploadField';
import {
  catalogKeys,
  useCategoriesQuery,
  useCategoryAttributesQuery,
  useCategoryQuery,
  useCategoryTreeQuery,
} from '../../queries';
import { findCategoryNode } from '../../utils/categoryTree';

type TabId = 'overview' | 'children' | 'attributes';

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
  const [tab, setTab] = useState<TabId>(
    initialTab === 'attributes' || initialTab === 'children' ? initialTab : 'overview',
  );
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tree = [] } = useCategoryTreeQuery();
  const { data: category, isLoading: loadingCat, isError } = useCategoryQuery(idOk ? categoryIdNum : null);
  const { data: children = [], isLoading: loadingChildren } = useCategoriesQuery(idOk ? categoryIdNum : null, {
    enabled: idOk,
  });
  const { data: attrDefs = [], isLoading: loadingAttrs } = useCategoryAttributesQuery(
    idOk ? categoryIdNum : null,
    { includeInherited: true },
  );

  const node = useMemo(() => (idOk ? findCategoryNode(tree, categoryIdNum) : null), [tree, categoryIdNum, idOk]);

  const parentName = useMemo(() => {
    if (!category?.parent_id) return null;
    const p = findCategoryNode(tree, category.parent_id);
    return p?.name ?? `#${category.parent_id}`;
  }, [category, tree]);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!category) return;
    setName(category.name);
    setSlug(category.slug);
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
        slug: slug.trim(),
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

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: t('categories.detail_tab_overview') },
    { id: 'children', label: t('categories.detail_tab_children') },
    { id: 'attributes', label: t('categories.detail_tab_attributes') },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={category.name}
        actions={<BackButton to="/catalog/categories" label={t('categories.title')} />}
      />

      <nav className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tab === x.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            )}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <SectionCard title={t('categories.detail_tab_overview')}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>{t('categories.field.name')}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canUpdate} />
              </div>
              <div className="space-y-1">
                <Label>{t('categories.field.slug')}</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canUpdate} />
              </div>
              <CategoryImageUploadField
                value={imageUrl}
                onChange={setImageUrl}
                disabled={!canUpdate}
                inputId="category-detail-image"
              />
              <div className="flex items-center gap-2">
                {i18n.dir() === 'rtl' ? (
                  <>
                    <Switch
                      checked={isActive}
                      onCheckedChange={setIsActive}
                      disabled={!canUpdate}
                      aria-labelledby="category-detail-active-label"
                    />
                    <span className="shrink-0 text-sm font-medium" id="category-detail-active-label">
                      {isActive ? t('categories.field.active_state_on') : t('categories.field.active_state_off')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="shrink-0 text-sm font-medium" id="category-detail-active-label">
                      {isActive ? t('categories.field.active_state_on') : t('categories.field.active_state_off')}
                    </span>
                    <Switch
                      checked={isActive}
                      onCheckedChange={setIsActive}
                      disabled={!canUpdate}
                      aria-labelledby="category-detail-active-label"
                    />
                  </>
                )}
              </div>
              {canUpdate ? (
                <Button type="button" onClick={() => void saveMeta.mutate()} disabled={saveMeta.isPending}>
                  {t('actions.save')}
                </Button>
              ) : null}
            </div>
            <div className="space-y-3">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
                {imageUrl.trim() !== '' ? (
                  <img
                    src={resolveMediaUrl(imageUrl.trim()) ?? imageUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-12 opacity-50" />
                  </div>
                )}
              </div>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t('categories.detail_parent')}</dt>
                  <dd className="text-end font-medium">{parentName ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t('categories.detail_subcategories_label')}</dt>
                  <dd className="text-end font-medium">{node?.children?.length ?? children.length}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t('categories.detail_products_direct_label')}</dt>
                  <dd className="text-end font-medium">{node?.direct_product_count ?? 0}</dd>
                </div>
              </dl>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {tab === 'children' ? (
        <SectionCard
          title={t('categories.detail_tab_children')}
          description={t('categories.detail_children_lead')}
        >
          <div className="mb-4 flex justify-end">
            {canUpdate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus className="me-1 size-4" />
                {t('categories.child')}
              </Button>
            ) : null}
          </div>
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

      {tab === 'attributes' ? (
        <SectionCard title={t('categories.detail_tab_attributes')}>
          {loadingAttrs ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
          {!loadingAttrs ? (
            <CategoryAttributeForm key={categoryIdNum} categoryId={categoryIdNum} defs={attrDefs} canUpdate={canUpdate} />
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  );
}

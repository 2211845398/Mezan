import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderTree, ImageIcon, LayoutGrid, Plus, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { SectionCard } from '@/components/shared/ContentSurface';
import { PageTabNav } from '@/components/shared/PageTabNav';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';
import { handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { readOnlyTextInputProps } from '@/lib/readOnlyFieldStyles';
import { useEditableFormMode } from '@/lib/useEditableFormMode';
import RouteLoader from '@/routes/RouteLoader';

import { updateCategory } from '../../api';
import { CategoryCombobox } from '../../components/CategoryCombobox';
import { CategoryCreateDialog } from '../../components/CategoryCreateDialog';
import { CategoryImageUploadField } from '../../components/CategoryImageUploadField';
import {
  catalogKeys,
  useCategoriesQuery,
  useCategoryQuery,
  useCategoryTreeQuery,
} from '../../queries';
import {
  collectDescendantIds,
  findCategoryNode,
  flattenCategoryTree,
} from '../../utils/categoryTree';
import { CategoryRevenueTab } from './CategoryRevenueTab';

type TabId = 'overview' | 'children' | 'revenue';

const categoryOverviewSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  is_active: z.boolean(),
  image_url: z.string().nullable(),
  parent_id: z.number().nullable(),
});

type CategoryOverviewFormValues = z.infer<typeof categoryOverviewSchema>;

const CATEGORY_DETAIL_FORM_ID = 'catalog-category-detail-form';

export default function CategoryPropertiesPage() {
  const { categoryId: categoryIdParam } = useParams<{ categoryId: string }>();
  const { t, i18n } = useTranslation('catalog');
  const qc = useQueryClient();
  const canRead = usePermission('catalog', 'read');
  const canUpdate = usePermission('catalog', 'update');
  const canViewAnalytics = usePermission('analytics', 'read');

  const categoryIdNum = Number(categoryIdParam);
  const idOk = Number.isFinite(categoryIdNum) && categoryIdNum > 0;

  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<TabId>(() => {
    if (initialTab === 'children') return 'children';
    if (initialTab === 'revenue') return 'revenue';
    return 'overview';
  });
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tree = [] } = useCategoryTreeQuery();
  const { data: category, isLoading: loadingCat, isError } = useCategoryQuery(idOk ? categoryIdNum : null);
  const { data: children = [], isLoading: loadingChildren } = useCategoriesQuery(idOk ? categoryIdNum : null, {
    enabled: idOk,
  });
  const node = useMemo(() => (idOk ? findCategoryNode(tree, categoryIdNum) : null), [tree, categoryIdNum, idOk]);

  const form = useForm<CategoryOverviewFormValues>({
    resolver: zodResolver(categoryOverviewSchema),
    defaultValues: {
      name: '',
      slug: '',
      is_active: true,
      image_url: '',
      parent_id: null,
    },
  });

  const editMode = useEditableFormMode({ form, canEdit: canUpdate });
  const fieldsDisabled = !editMode.fieldsEnabled;
  const textRo = (extra?: string) => readOnlyTextInputProps(editMode.fieldsEnabled, extra);
  const imageUrl = form.watch('image_url');
  const previewSrc = useMemo(
    () => resolveMediaUrl((imageUrl ?? '').trim() || undefined),
    [imageUrl],
  );

  const parentName = useMemo(() => {
    const parentId = category?.parent_id;
    if (parentId == null) return null;
    const p = findCategoryNode(tree, parentId);
    return p?.name ?? `#${parentId}`;
  }, [category, tree]);

  const excludedParentIds = useMemo(() => {
    const ids = collectDescendantIds(node);
    ids.add(categoryIdNum);
    return ids;
  }, [node, categoryIdNum]);

  const parentOptions = useMemo(() => {
    const flat = flattenCategoryTree(tree, '', true);
    const currentParentId = category?.parent_id;
    if (currentParentId != null) {
      const parentNode = findCategoryNode(tree, currentParentId);
      if (parentNode && parentNode.is_active === false && !flat.some((o) => o.id === currentParentId)) {
        flat.push({ id: currentParentId, label: parentNode.name });
      }
    }
    return flat
      .filter((o) => !excludedParentIds.has(o.id))
      .map((o) => ({ id: o.id, label: o.label }));
  }, [tree, category?.parent_id, excludedParentIds]);

  useEffect(() => {
    if (!category) return;
    form.reset({
      name: category.name,
      slug: category.slug,
      is_active: category.is_active,
      image_url: category.image_url ?? '',
      parent_id: category.parent_id ?? null,
    });
    editMode.syncSnapshot();
  }, [category, form, editMode.syncSnapshot]);

  useEffect(() => {
    setCreateOpen(false);
  }, [categoryIdNum]);

  const saveMeta = useMutation({
    mutationFn: (values: CategoryOverviewFormValues) =>
      updateCategory(categoryIdNum, {
        name: values.name.trim(),
        slug: values.slug.trim(),
        image_url: (values.image_url ?? '').trim() === '' ? null : (values.image_url ?? '').trim(),
        is_active: values.is_active,
        parent_id: values.parent_id,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('categories.detail_saved'));
      editMode.finishEdit();
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
    ...(canViewAnalytics
      ? [{ id: 'revenue' as const, label: t('categories.detail_tab_revenue'), icon: TrendingUp }]
      : []),
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
          <Form {...form}>
            <form
              id={CATEGORY_DETAIL_FORM_ID}
              className="space-y-4"
              onKeyDown={handleFormEnterSubmit}
              onSubmit={form.handleSubmit((values) => saveMeta.mutate(values))}
              noValidate
            >
              <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-6">
                <div className="flex flex-col gap-4 lg:h-full">
                  <div className="rounded-lg border bg-muted/15 p-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField
                        name="name"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem className="space-y-1.5">
                            <FormLabel className="text-sm">{t('categories.field.name')}</FormLabel>
                            <FormControl>
                              <Input {...field} {...textRo('h-9')} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        name="slug"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem className="space-y-1.5">
                            <FormLabel className="text-sm">{t('categories.field.slug')}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                dir={i18n.dir()}
                                {...textRo('h-9 font-mono text-sm')}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField
                        name="is_active"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem className="space-y-1.5">
                            <FormLabel className="text-sm">{t('categories.field.status')}</FormLabel>
                            {editMode.isEditing ? (
                              <Select
                                value={field.value ? 'active' : 'archived'}
                                onValueChange={(v) => field.onChange(v === 'active')}
                              >
                                <FormControl>
                                  <SelectTrigger dir={i18n.dir()} className="h-9 w-full text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent dir={i18n.dir()}>
                                  <SelectItem value="active">{t('categories.field.active_state_on')}</SelectItem>
                                  <SelectItem value="archived">{t('categories.field.active_state_off')}</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <p className="flex h-9 items-center text-sm font-medium">
                                {field.value
                                  ? t('categories.field.active_state_on')
                                  : t('categories.field.active_state_off')}
                              </p>
                            )}
                          </FormItem>
                        )}
                      />
                      <FormField
                        name="image_url"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem className="space-y-1.5">
                            <FormLabel className="text-sm">{t('categories.field.image_upload')}</FormLabel>
                            <FormControl>
                              {editMode.isEditing ? (
                                <CategoryImageUploadField
                                  value={field.value ?? ''}
                                  onChange={field.onChange}
                                  inputId="category-detail-image"
                                  layout="controls-only"
                                />
                              ) : (
                                <p className="flex h-9 items-center text-sm font-medium">
                                  {(field.value ?? '').trim() !== '' ? t('categories.image_uploaded') : '—'}
                                </p>
                              )}
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/15 p-4 space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">{t('categories.detail_parent')}</p>
                      {editMode.isEditing ? (
                        <FormField
                          name="parent_id"
                          control={form.control}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <CategoryCombobox
                                  value={field.value}
                                  onChange={field.onChange}
                                  options={parentOptions}
                                  disabled={fieldsDisabled}
                                  allowAll
                                  allLabel={t('categories.parent_none')}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      ) : (
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
                      )}
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

              <div className="border-t pt-4">
                <DetailFormActionBar
                  isEditing={editMode.isEditing}
                  canEdit={canUpdate}
                  isSubmitting={saveMeta.isPending}
                  formId={CATEGORY_DETAIL_FORM_ID}
                  onStartEdit={editMode.startEdit}
                  onCancelEdit={editMode.cancelEdit}
                />
              </div>
            </form>
          </Form>
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

      {tab === 'revenue' && canViewAnalytics ? (
        <CategoryRevenueTab categoryId={categoryIdNum} />
      ) : null}
    </div>
  );
}

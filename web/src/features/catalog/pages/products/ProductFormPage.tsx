import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { FormContainer } from '@/components/shared/ContentSurface';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';

import type { VariantDraftRow } from '../../api';
import {
  createProduct,
  getProductWithVariants,
  listTaxDefinitions,
  previewGenerateVariants,
  syncProductVariants,
  updateProduct,
} from '../../api';
import { ProductAttributesTab } from '../../components/ProductAttributesTab';
import { ProductDataTab } from '../../components/ProductDataTab';
import type { VariantAxisLine } from '../../components/ProductVariantAxesEditor';
import { axesToPayload, mergePreviewWithDraftRows } from '../../lib/variantSyncHelpers';
import { cartesianVariantCount } from '../../lib/cartesianCount';
import { catalogKeys, useCategoryTreeQuery, useProductQuery } from '../../queries';

function flattenCategoryTree(
  nodes: { id: number; name: string; is_active?: boolean; children?: typeof nodes }[],
  prefix = '',
  activeOnly = true,
): { id: number; label: string }[] {
  const o: { id: number; label: string }[] = [];
  for (const n of nodes) {
    if (activeOnly && n.is_active === false) {
      continue;
    }
    o.push({ id: n.id, label: prefix + n.name });
    if (n.children?.length) {
      o.push(...flattenCategoryTree(n.children, `${prefix + n.name} / `, activeOnly));
    }
  }
  return o;
}

const productFormSchema = z.object({
  category_id: z.number().min(1),
  tag_category_ids: z.array(z.number()),
  name: z.string().min(1),
  sku: z.string().max(128).optional(),
  barcode: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  output_vat_rate: z.string(),
  tax_definition_ids: z.array(z.number()),
  attributes: z.record(z.unknown()).optional(),
  isActive: z.boolean(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

type ProductTab = 'productData' | 'attributes';

export default function ProductFormPage() {
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useParams<{ productId: string }>();
  const qc = useQueryClient();
  const canCreate = usePermission('catalog', 'create');
  const canUpdate = usePermission('catalog', 'update');

  const isNew = /\/products\/new\/?$/.test(location.pathname);
  const rawProductId = isNew ? null : Number(params.productId);
  const productIdValid =
    !isNew && rawProductId !== null && !Number.isNaN(rawProductId) && rawProductId > 0;

  const activeTab: ProductTab =
    searchParams.get('tab') === 'attributes' ? 'attributes' : 'productData';

  const { data: product, isLoading: loadingProduct } = useProductQuery(
    isNew || !productIdValid ? null : rawProductId,
  );
  const { data: tree = [] } = useCategoryTreeQuery();
  const { data: taxDefinitions = [] } = useQuery({
    queryKey: catalogKeys.taxDefinitions(true),
    queryFn: () => listTaxDefinitions(true),
  });
  const flat = useMemo(() => flattenCategoryTree(tree, '', true), [tree]);
  const activeTaxOptions = useMemo(
    () => taxDefinitions.filter((d) => d.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [taxDefinitions],
  );

  const allowed = isNew ? canCreate : canUpdate;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      category_id: 0,
      tag_category_ids: [],
      name: '',
      sku: '',
      barcode: '',
      image_url: '',
      output_vat_rate: '0',
      tax_definition_ids: [],
      attributes: {},
      isActive: true,
    },
  });

  useEffect(() => {
    if (isNew) {
      const first = flat[0];
      if (first) {
        form.setValue('category_id', first.id, { shouldValidate: true });
      }
      return;
    }
    if (!product) {
      return;
    }
    const linked = product.category_ids ?? [product.category_id];
    const tags = linked.filter((id) => id !== product.category_id);
    form.reset({
      category_id: product.category_id,
      tag_category_ids: tags,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? '',
      image_url: product.image_url ?? '',
      output_vat_rate: String(product.output_vat_rate ?? '0'),
      tax_definition_ids: [...(product.tax_definition_ids ?? [])],
      attributes: (product.attributes as Record<string, unknown>) ?? {},
      isActive: product.status !== 'archived',
    });
  }, [isNew, product, form, flat]);

  const watchedPrimary = form.watch('category_id');
  useEffect(() => {
    const tags = form.getValues('tag_category_ids');
    const next = tags.filter((id) => id !== watchedPrimary);
    if (next.length !== tags.length) {
      form.setValue('tag_category_ids', next, { shouldDirty: true });
    }
  }, [watchedPrimary, form]);

  const [axes, setAxes] = useState<VariantAxisLine[]>([]);
  const [variantRows, setVariantRows] = useState<VariantDraftRow[]>([]);
  const watchedName = form.watch('name');

  const hasVariantAxes = axes.some((a) => a.attributeId > 0 && a.selectedValueIds.length > 0);

  useEffect(() => {
    if (isNew || !productIdValid || !rawProductId) {
      setAxes([]);
      setVariantRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getProductWithVariants(rawProductId);
      if (cancelled) {
        return;
      }
      setAxes(
        (res.axes ?? []).map((line) => ({
          attributeId: line.attribute_id,
          selectedValueIds: [...line.value_ids],
        })),
      );
      const nonDefault = res.variants.filter((v) => {
        const av = v.attribute_values ?? {};
        return !av._default;
      });
      setVariantRows(
        nonDefault.map((v) => ({
          id: v.id,
          attribute_value_ids: v.attribute_value_ids ?? [],
          sku: v.sku,
          barcode: v.barcode ?? '',
          active: v.active,
          price_extra: String(v.price_extra ?? '0'),
          display_label: v.display_label ?? v.sku,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, productIdValid, rawProductId]);

  const tagOptions = useMemo(() => flat.filter((c) => c.id !== watchedPrimary), [flat, watchedPrimary]);

  const saveM = useMutation({
    mutationFn: async (v: ProductFormValues) => {
      const extraTags = v.tag_category_ids.filter((id) => id !== v.category_id);
      const attrs: Record<string, unknown> = { ...(v.attributes as Record<string, unknown> | undefined) };
      const imageTrimmed = v.image_url?.trim() ?? '';
      const taxIds = [...new Set(v.tax_definition_ids)].sort((a, b) => a - b);
      const vatOut = taxIds.length > 0 ? '0' : v.output_vat_rate;
      const axesPayload = axesToPayload(axes);
      const hasAxes = Object.keys(axesPayload).length > 0;

      let productId: number;

      if (isNew) {
        const body: Parameters<typeof createProduct>[0] = {
          category_id: v.category_id,
          name: v.name,
          barcode: hasAxes ? null : v.barcode || null,
          status: v.isActive ? 'active' : 'archived',
          attributes: attrs,
          output_vat_rate: vatOut,
          sell_price_currency_id: null,
          category_ids: extraTags,
          tax_definition_ids: taxIds,
          image_url: imageTrimmed === '' ? null : imageTrimmed,
          standard_cost: null,
          sell_price: null,
        };
        const created = await createProduct(body);
        productId = created.id;
      } else {
        if (!product) {
          throw new Error('missing product');
        }
        const ubody: Parameters<typeof updateProduct>[1] = {
          category_id: v.category_id,
          name: v.name,
          sku: product.sku,
          barcode: hasAxes ? null : v.barcode || null,
          status: v.isActive ? 'active' : 'archived',
          attributes: attrs,
          output_vat_rate: vatOut,
          sell_price_currency_id: null,
          category_ids: extraTags,
          tax_definition_ids: taxIds,
          image_url: imageTrimmed === '' ? null : imageTrimmed,
          standard_cost: null,
          sell_price: null,
        };
        const updated = await updateProduct(product.id, ubody);
        productId = updated.id;
      }

      let syncCount = 0;
      let rows = variantRows;

      if (hasAxes) {
        const preview = await previewGenerateVariants(productId, axesPayload);
        rows = mergePreviewWithDraftRows(preview.rows, variantRows);
        const result = await syncProductVariants(productId, {
          axes: axesPayload,
          variants: rows.map((r) => ({
            id: r.id,
            attribute_value_ids: r.attribute_value_ids,
            sku: r.sku,
            barcode: r.barcode || null,
            active: r.active,
            price_extra: r.price_extra || '0',
          })),
        });
        syncCount = result.created + result.updated;
        setVariantRows(rows);
      } else {
        const result = await syncProductVariants(productId, {
          axes: {},
          variants: [],
        });
        syncCount = result.created + result.updated || 1;
      }

      return { productId, syncCount, wasNew: isNew };
    },
    onSuccess: ({ productId, syncCount, wasNew }) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.root });
      if (wasNew) {
        toast.success(t('products.save_variants_ok', { count: syncCount }));
        navigate(`/catalog/products/${productId}/edit?tab=attributes`, { replace: true });
        return;
      }
      toast.success(t('products.save_ok'));
      setSearchParams({ tab: 'attributes' });
    },
    onError: (error) => {
      notifyApiError(error, t('errors.generic'));
      if (activeTab !== 'attributes') {
        setSearchParams({ tab: 'attributes' });
      }
    },
  });

  if (!isNew && !productIdValid) {
    return (
      <div className="p-6">
        <PageHeader title={t('products.edit')} actions={<BackButton to="/catalog/products" label={t('products.title')} />} />
        <p className="mt-4 text-sm text-destructive">{t('errors.not_found')}</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6">
        <PageHeader title={t('products.title')} actions={<BackButton to="/catalog/products" label={t('products.title')} />} />
        <p className="mt-4 text-sm text-muted-foreground">{t('products.no_permission')}</p>
      </div>
    );
  }

  const variantPreviewCount = cartesianVariantCount(
    axes.map((a) => ({ valueIds: a.selectedValueIds })),
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={isNew ? t('products.create') : t('products.edit')}
        actions={<BackButton to="/catalog/products" label={t('products.title')} />}
      />

      {isNew || product ? (
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((v) => saveM.mutate(v))} className="space-y-6">
            <FormContainer maxWidth="full" className="max-w-6xl px-0 py-0">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setSearchParams(v === 'attributes' ? { tab: 'attributes' } : {})}
              >
                <TabsList className="mb-4">
                  <TabsTrigger value="productData">{t('products.tabs.product_data')}</TabsTrigger>
                  <TabsTrigger value="attributes">
                    {t('products.tabs.attributes_variants')}
                    {!isNew && variantRows.length > 0 ? (
                      <span className="ms-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs num-latin">
                        {variantRows.length}
                      </span>
                    ) : isNew && hasVariantAxes ? (
                      <span className="ms-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs num-latin">
                        {variantPreviewCount}
                      </span>
                    ) : null}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="productData" className="mt-0">
                  <ProductDataTab
                    form={form}
                    flat={flat}
                    tagOptions={tagOptions}
                    activeTaxOptions={activeTaxOptions}
                    hasVariantAxes={hasVariantAxes}
                    showSimpleBarcode
                  />
                </TabsContent>

                <TabsContent value="attributes" className="mt-0">
                  <ProductAttributesTab
                    productId={isNew ? null : rawProductId}
                    productName={watchedName}
                    axes={axes}
                    onAxesChange={setAxes}
                    variantRows={variantRows}
                    onVariantRowsChange={setVariantRows}
                    disabled={saveM.isPending}
                  />
                </TabsContent>
              </Tabs>

              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => navigate('/catalog/products')}>
                  {t('actions.cancel')}
                </Button>
                <Button type="submit" disabled={saveM.isPending || loadingProduct || (!isNew && !product)}>
                  {t('actions.save')}
                </Button>
              </div>
            </FormContainer>
          </form>
        </FormProvider>
      ) : null}
      {!isNew && !product && !loadingProduct ? (
        <p className="text-sm text-destructive">{t('errors.not_found')}</p>
      ) : null}
    </div>
  );
}

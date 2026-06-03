import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Package, Ruler } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { FormContainer } from '@/components/shared/ContentSurface';
import { PageTabNav } from '@/components/shared/PageTabNav';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';

import type { VariantDraftRow } from '../../api';
import {
  createProduct,
  getProductWithVariants,
  listTaxDefinitions,
  listUnitsOfMeasure,
  previewGenerateVariants,
  syncProductVariants,
  updateProduct,
} from '../../api';
import { ProductAttributesTab } from '../../components/ProductAttributesTab';
import { ProductDataTab } from '../../components/ProductDataTab';
import { ProductUnitsTab } from '../../components/ProductUnitsTab';
import type { VariantAxisLine } from '../../components/ProductVariantAxesEditor';
import {
  axesToPayload,
  mapApiVariantsToDraft,
  mergePreviewWithDraftRows,
} from '../../lib/variantSyncHelpers';
import { cartesianVariantCount } from '../../lib/cartesianCount';
import {
  formatConversionFactor,
  normalizeProductUomsForSave,
} from '../../lib/uomConversion';
import {
  catalogKeys,
  useCategoryTreeQuery,
  useProductQuery,
} from '../../queries';

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

function createProductFormSchema(requiredMsg: string) {
  return z.object({
    category_id: z.number().min(1, requiredMsg),
    tag_category_ids: z.array(z.number()),
    name: z.string().min(1, requiredMsg),
    sku: z.string().max(128).optional(),
    uom_id: z.number().min(1),
    alternative_uoms: z
      .array(
        z.object({
          uom_id: z.number(),
          factor_to_base: z.string(),
        }),
      )
      .superRefine((rows, ctx) => {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          const empty = row.uom_id <= 0 && row.factor_to_base.trim() === '';
          if (empty) continue;
          if (row.uom_id <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: requiredMsg,
              path: [i, 'uom_id'],
            });
          }
          const factorStr = row.factor_to_base.trim();
          const factorNum = factorStr === '' ? 0 : Number(factorStr);
          if (
            factorStr === '' ||
            !/^\d+$/.test(factorStr) ||
            !Number.isInteger(factorNum) ||
            factorNum <= 0
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: requiredMsg,
              path: [i, 'factor_to_base'],
            });
          }
        }
      }),
    image_url: z.string().optional().nullable(),
    output_vat_rate: z.string(),
    tax_definition_ids: z.array(z.number()),
    isActive: z.boolean(),
  });
}

type ProductFormValues = z.infer<ReturnType<typeof createProductFormSchema>>;

type ProductTab = 'productData' | 'units' | 'attributes';

export default function ProductFormPage() {
  const { t, i18n } = useTranslation('catalog');
  const { t: tc } = useTranslation('common');
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

  const tabParam = searchParams.get('tab');
  const activeTab: ProductTab =
    tabParam === 'attributes' ? 'attributes' : tabParam === 'units' ? 'units' : 'productData';

  const { data: product, isLoading: loadingProduct } = useProductQuery(
    isNew || !productIdValid ? null : rawProductId,
  );
  const { data: tree = [] } = useCategoryTreeQuery();
  const { data: taxDefinitions = [] } = useQuery({
    queryKey: catalogKeys.taxDefinitions(true),
    queryFn: () => listTaxDefinitions(true),
  });
  const { data: uoms = [] } = useQuery({
    queryKey: ['catalog', 'units-of-measure'],
    queryFn: () => listUnitsOfMeasure(),
  });
  const defaultUomId = uoms.find((u) => u.code === 'PIECE')?.id ?? uoms[0]?.id ?? 1;
  const flat = useMemo(() => flattenCategoryTree(tree, '', true), [tree]);
  const activeTaxOptions = useMemo(
    () => taxDefinitions.filter((d) => d.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [taxDefinitions],
  );

  const allowed = isNew ? canCreate : canUpdate;

  const productFormSchema = useMemo(
    () => createProductFormSchema(tc('errors.validation_required')),
    [tc],
  );

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      category_id: 0,
      tag_category_ids: [],
      name: '',
      sku: '',
      uom_id: 1,
      alternative_uoms: [],
      image_url: '',
      output_vat_rate: '0',
      tax_definition_ids: [],
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
      uom_id: product.uom_id ?? defaultUomId,
      alternative_uoms: (product.alternative_uoms ?? []).map((a) => ({
        uom_id: a.uom_id,
        factor_to_base: formatConversionFactor(a.factor_to_base),
      })),
      image_url: product.image_url ?? '',
      output_vat_rate: String(product.output_vat_rate ?? '0'),
      tax_definition_ids: [...(product.tax_definition_ids ?? [])],
      isActive: product.status !== 'archived',
    });
  }, [isNew, product, form, flat, defaultUomId]);

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
  const [, setVariantsHydrated] = useState(isNew);
  const watchedName = form.watch('name');

  const hasVariantAxes = axes.some((a) => a.attributeId > 0 && a.selectedValueIds.length > 0);

  useEffect(() => {
    if (isNew || !productIdValid || !rawProductId) {
      setAxes([]);
      setVariantRows([]);
      setVariantsHydrated(true);
      return;
    }
    setVariantsHydrated(false);
    let cancelled = false;
    void (async () => {
      try {
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
        setVariantRows(mapApiVariantsToDraft(res.variants));
      } finally {
        if (!cancelled) {
          setVariantsHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, productIdValid, rawProductId]);

  const tagOptions = useMemo(() => flat.filter((c) => c.id !== watchedPrimary), [flat, watchedPrimary]);

  const saveM = useMutation({
    mutationFn: async (v: ProductFormValues) => {
      const extraTags = v.tag_category_ids.filter((id) => id !== v.category_id);
      const imageTrimmed = v.image_url?.trim() ?? '';
      const taxIds = [...new Set(v.tax_definition_ids)].sort((a, b) => a - b);
      const vatOut = taxIds.length > 0 ? '0' : v.output_vat_rate;
      const filteredAltRows = v.alternative_uoms
        .filter((row) => row.uom_id > 0 && row.factor_to_base.trim() !== '')
        .map((row) => ({
          uom_id: row.uom_id,
          factor_to_base: formatConversionFactor(row.factor_to_base),
        }));
      const { uom_id: normalizedUomId, alternative_uoms } = normalizeProductUomsForSave(
        v.uom_id,
        filteredAltRows,
        uoms,
      );
      const alternativeUomsPayload = alternative_uoms.map((row) => ({
        uom_id: row.uom_id,
        factor_to_base: parseInt(row.factor_to_base, 10),
      }));
      const axesPayload = axesToPayload(axes);
      const hasAxes = Object.keys(axesPayload).length > 0;

      let productId: number;

      if (isNew) {
        const body: Parameters<typeof createProduct>[0] = {
          category_id: v.category_id,
          name: v.name,
          uom_id: normalizedUomId,
          alternative_uoms: alternativeUomsPayload,
          status: v.isActive ? 'active' : 'archived',
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
          uom_id: normalizedUomId,
          alternative_uoms: alternativeUomsPayload,
          status: v.isActive ? 'active' : 'archived',
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
            reference_code: r.reference_code.trim() || null,
            active: r.active,
            price_extra: r.price_extra || '0',
          })),
        });
        syncCount = result.created + result.updated;
        const refreshed = await getProductWithVariants(productId);
        setAxes(
          (refreshed.axes ?? []).map((line) => ({
            attributeId: line.attribute_id,
            selectedValueIds: [...line.value_ids],
          })),
        );
        setVariantRows(mapApiVariantsToDraft(refreshed.variants));
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
      <div dir={i18n.dir()} className="p-6 text-start">
        <PageHeader title={t('products.edit')} actions={<BackButton to="/catalog/products" label={t('products.title')} />} />
        <p className="mt-4 text-sm text-destructive">{t('errors.not_found')}</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div dir={i18n.dir()} className="p-6 text-start">
        <PageHeader title={t('products.title')} actions={<BackButton to="/catalog/products" label={t('products.title')} />} />
        <p className="mt-4 text-sm text-muted-foreground">{t('products.no_permission')}</p>
      </div>
    );
  }

  const variantPreviewCount = cartesianVariantCount(
    axes.map((a) => ({ valueIds: a.selectedValueIds })),
  );

  const activeVariantCount = variantRows.filter((r) => r.active).length;

  const variantBadge =
    !isNew && activeVariantCount > 0 ? (
      <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-xs num-latin">
        {activeVariantCount}
      </span>
    ) : isNew && hasVariantAxes ? (
      <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-xs num-latin">
        {variantPreviewCount}
      </span>
    ) : undefined;

  const productTabs = [
    { id: 'productData', label: t('products.tabs.product_data'), icon: Package },
    { id: 'units', label: t('products.tabs.units'), icon: Ruler },
    {
      id: 'attributes',
      label: t('products.tabs.attributes_variants'),
      icon: Layers,
      badge: variantBadge,
    },
  ];

  const tabSearchParam = (id: string) => {
    if (id === 'attributes') return { tab: 'attributes' };
    if (id === 'units') return { tab: 'units' };
    return {};
  };

  const saveFooter = (
    <>
      <Button type="button" variant="outline" onClick={() => navigate('/catalog/products')}>
        {t('actions.cancel')}
      </Button>
      <Button type="submit" disabled={saveM.isPending || loadingProduct || (!isNew && !product)}>
        {t('actions.save')}
      </Button>
    </>
  );

  return (
    <div
      dir={i18n.dir()}
      className="flex flex-col gap-6 p-4 text-start md:p-6"
    >
      <PageHeader
        title={isNew ? t('products.create') : t('products.edit')}
        actions={<BackButton to="/catalog/products" label={t('products.title')} />}
      />

      {isNew || product ? (
        <FormProvider {...form}>
          <form
            onSubmit={form.handleSubmit((v) => saveM.mutate(v))}
            onKeyDown={handleFormEnterSubmit}
            className="space-y-6"
            aria-busy={saveM.isPending}
          >
            <FormContainer
              maxWidth="full"
              className="mx-0 me-auto w-full max-w-full px-0 py-0"
            >
              <PageTabNav
                mode="button"
                items={productTabs}
                activeId={activeTab}
                onSelect={(id) => setSearchParams(tabSearchParam(id))}
                className="mb-4"
              />

              {activeTab === 'productData' ? (
                <ProductDataTab
                  form={form as never}
                  flat={flat}
                  tagOptions={tagOptions}
                  activeTaxOptions={activeTaxOptions}
                  footer={saveFooter}
                />
              ) : activeTab === 'units' ? (
                <ProductUnitsTab form={form as never} uoms={uoms} footer={saveFooter} />
              ) : (
                <>
                  <ProductAttributesTab
                    productId={isNew ? null : rawProductId}
                    productName={watchedName}
                    axes={axes}
                    onAxesChange={setAxes}
                    variantRows={variantRows}
                    onVariantRowsChange={setVariantRows}
                    disabled={saveM.isPending}
                  />
                  <div className="mt-6 flex flex-wrap items-center justify-end gap-2">{saveFooter}</div>
                </>
              )}
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

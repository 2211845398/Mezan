import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { FormContainer, SectionCard } from '@/components/shared/ContentSurface';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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
import { cn } from '@/lib/utils';

import {
  createProduct,
  listTaxDefinitions,
  updateProduct,
} from '../../api';
import { BarcodeRepeater } from '../../components/BarcodeRepeater';
import { ProductImageUploadField } from '../../components/ProductImageUploadField';
import { catalogKeys, useCategoryAttributesQuery, useCategoryTreeQuery, useProductQuery } from '../../queries';

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

function buildProductFormSchema(isNew: boolean) {
  return z.object({
    category_id: z.number().min(1),
    tag_category_ids: z.array(z.number()),
    name: z.string().min(1),
    sku: isNew ? z.string().max(128) : z.string().min(1).max(128),
    barcode: z.string().optional().nullable(),
    image_url: z.string().optional().nullable(),
    output_vat_rate: z.string(),
    tax_definition_ids: z.array(z.number()),
    attributes: z.record(z.unknown()).optional(),
    isActive: z.boolean(),
  });
}

type ProductFormValues = z.infer<ReturnType<typeof buildProductFormSchema>>;

export default function ProductFormPage() {
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ productId: string }>();
  const qc = useQueryClient();
  const canCreate = usePermission('catalog', 'create');
  const canUpdate = usePermission('catalog', 'update');

  const isNew = /\/products\/new\/?$/.test(location.pathname);
  const rawProductId = isNew ? null : Number(params.productId);
  const productIdValid =
    !isNew && rawProductId !== null && !Number.isNaN(rawProductId) && rawProductId > 0;

  const formSchema = useMemo(() => buildProductFormSchema(isNew), [isNew]);

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
    resolver: zodResolver(formSchema),
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

  const categoryForAttrs = form.watch('category_id');
  const { data: defs } = useCategoryAttributesQuery(categoryForAttrs > 0 ? categoryForAttrs : null);

  const tagOptions = useMemo(() => flat.filter((c) => c.id !== watchedPrimary), [flat, watchedPrimary]);

  const saveM = useMutation({
    mutationFn: async (v: ProductFormValues) => {
      const extraTags = v.tag_category_ids.filter((id) => id !== v.category_id);
      const attrs: Record<string, unknown> = { ...(v.attributes as Record<string, unknown> | undefined) };
      const imageTrimmed = v.image_url?.trim() ?? '';
      const taxIds = [...new Set(v.tax_definition_ids)].sort((a, b) => a - b);
      const vatOut = taxIds.length > 0 ? '0' : v.output_vat_rate;

      if (isNew) {
        const body: Parameters<typeof createProduct>[0] = {
          category_id: v.category_id,
          name: v.name,
          ...(v.sku.trim() !== '' ? { sku: v.sku.trim() } : {}),
          barcode: v.barcode || null,
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
        return createProduct(body);
      }
      if (!product) {
        throw new Error('missing product');
      }
      const ubody: Parameters<typeof updateProduct>[1] = {
        category_id: v.category_id,
        name: v.name,
        sku: v.sku.trim(),
        barcode: v.barcode || null,
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
      return updateProduct(product.id, ubody);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('products.save_ok'));
      navigate('/catalog/products');
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const toggleTax = (id: number, checked: boolean) => {
    const cur = form.getValues('tax_definition_ids');
    if (checked) {
      if (!cur.includes(id)) {
        form.setValue('tax_definition_ids', [...cur, id], { shouldDirty: true, shouldValidate: true });
      }
    } else {
      form.setValue(
        'tax_definition_ids',
        cur.filter((x) => x !== id),
        { shouldDirty: true, shouldValidate: true },
      );
    }
  };

  const toggleTag = (id: number, checked: boolean) => {
    const cur = form.getValues('tag_category_ids');
    if (checked) {
      if (!cur.includes(id)) {
        form.setValue('tag_category_ids', [...cur, id], { shouldDirty: true, shouldValidate: true });
      }
    } else {
      form.setValue(
        'tag_category_ids',
        cur.filter((x) => x !== id),
        { shouldDirty: true, shouldValidate: true },
      );
    }
  };

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
              <div className="grid gap-6 lg:grid-cols-12 lg:items-stretch">
                <div className="flex flex-col gap-6 lg:col-span-7">
                  <SectionCard title={t('products.section.main')}>
                    <FormField
                      control={form.control}
                      name="output_vat_rate"
                      render={({ field }) => (
                        <FormItem className="hidden">
                          <FormControl>
                            <input type="hidden" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel className="text-sm">{t('products.field.name')}</FormLabel>
                            <FormControl>
                              <Input {...field} className="h-8 text-sm" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="rounded-md border border-dashed bg-muted/15 p-3 sm:col-span-2">
                        <p className="text-sm font-medium">{t('products.tax.title')}</p>
                        {activeTaxOptions.length === 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">{t('products.tax.empty_defs')}</p>
                        ) : (
                          <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border border-border/60 bg-background/50 p-2">
                            {activeTaxOptions.map((d) => {
                              const checked = form.watch('tax_definition_ids').includes(d.id);
                              const pct = (Number.parseFloat(String(d.rate)) * 100).toFixed(2);
                              return (
                                <button
                                  key={d.id}
                                  type="button"
                                  className={cn(
                                    'rounded-full border px-2.5 py-1 text-start text-xs transition-colors',
                                    checked
                                      ? 'border-primary bg-primary/10 font-medium text-foreground shadow-sm'
                                      : 'border-border bg-background text-foreground hover:bg-muted/60',
                                  )}
                                  onClick={() => toggleTax(d.id, !checked)}
                                >
                                  <span>{d.name}</span>
                                  <span className="ms-1 num-latin text-muted-foreground">({pct}%)</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title={t('products.section.attributes')}>
                    <div className="rounded-md border border-dashed bg-muted/15 p-3">
                      <p className="text-sm font-medium">{t('products.variant_attrs_title')}</p>
                      {defs && defs.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {defs.map((d) => (
                            <span
                              key={d.id}
                              className="rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-xs"
                            >
                              {d.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </SectionCard>
                </div>

                <div className="flex flex-col gap-6 lg:col-span-5">
                  <SectionCard title={t('products.section.categories')}>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="category_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">{t('products.field.primary_category')}</FormLabel>
                            <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                              <FormControl>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {flat.map((c) => (
                                  <SelectItem key={c.id} value={String(c.id)}>
                                    {c.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="space-y-2">
                        <Label className="text-sm">{t('products.field.additional_categories')}</Label>
                        <p className="text-muted-foreground text-xs">{t('products.tags_help')}</p>
                        {tagOptions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t('products.tags_empty')}</p>
                        ) : (
                          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
                            {tagOptions.map((c) => {
                              const checked = form.watch('tag_category_ids').includes(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  className={cn(
                                    'rounded-full border px-2.5 py-1 text-start text-xs transition-colors',
                                    checked
                                      ? 'border-primary bg-primary/10 font-medium text-foreground shadow-sm'
                                      : 'border-border bg-background text-foreground hover:bg-muted/60',
                                  )}
                                  onClick={() => toggleTag(c.id, !checked)}
                                >
                                  {c.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title={t('products.section.presentation')}>
                    <div className="space-y-5">
                      <FormField
                        control={form.control}
                        name="image_url"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <ProductImageUploadField
                                value={field.value ?? ''}
                                onChange={field.onChange}
                                inputId="product-form-image"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {!isNew ? (
                        <div>
                          <BarcodeRepeater
                            value={form.watch('barcode') ?? ''}
                            onChange={(b) => form.setValue('barcode', b)}
                          />
                        </div>
                      ) : null}
                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                            <FormLabel className="!mt-0 text-sm">{t('products.field.active')}</FormLabel>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </SectionCard>
                </div>
              </div>

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

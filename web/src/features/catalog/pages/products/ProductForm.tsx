import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { MoneyInput } from '@/components/shared/form/MoneyInput';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';

import {
  createProduct,
  getDisplayPrice,
  postGenerateBarcode,
  type ProductRead,
  updateProduct,
} from '../../api';
import { AttributeFieldset } from '../../components/AttributeFieldset';
import { BarcodeRepeater } from '../../components/BarcodeRepeater';
import { catalogKeys, useCategoryAttributesQuery, useCategoryTreeQuery, useProductQuery } from '../../queries';

function flattenCategoryTree(
  nodes: { id: number; name: string; children?: typeof nodes }[],
  prefix = '',
): { id: number; label: string }[] {
  const o: { id: number; label: string }[] = [];
  for (const n of nodes) {
    o.push({ id: n.id, label: prefix + n.name });
    if (n.children?.length) {
      o.push(...flattenCategoryTree(n.children, `${prefix + n.name} / `));
    }
  }
  return o;
}

const formSchema = z.object({
  category_id: z.number().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional().nullable(),
  output_vat_rate: z.string(),
  sell_price: z.string().optional().nullable(),
  attributes: z.record(z.unknown()).optional(),
  isActive: z.boolean(),
});

type FormIn = z.infer<typeof formSchema>;

type ProductFormSheetProps = {
  productId: number | null;
  onClose: () => void;
};

export function ProductFormSheet({ productId, onClose }: ProductFormSheetProps) {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const isNew = productId == null;
  const { data: product, isLoading: loadingProduct } = useProductQuery(isNew ? null : productId);
  const { data: tree = [] } = useCategoryTreeQuery();
  const flat = useMemo(() => flattenCategoryTree(tree), [tree]);
  const form = useForm<FormIn>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category_id: 0,
      name: '',
      sku: '',
      barcode: '',
      output_vat_rate: '0',
      sell_price: '',
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
    const fromAttrs = product.attributes as { price?: number } | undefined;
    const priceFromAttrs = fromAttrs && typeof fromAttrs.price === 'number' ? String(fromAttrs.price) : '';
    form.reset({
      category_id: product.category_id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? '',
      output_vat_rate: String(product.output_vat_rate ?? '0'),
      sell_price: priceFromAttrs || (getDisplayPrice(product) === '—' ? '' : getDisplayPrice(product)),
      attributes: (product.attributes as Record<string, unknown>) ?? {},
      isActive: product.status !== 'archived',
    });
  }, [isNew, product, form, flat]);

  const categoryForAttrs = form.watch('category_id');
  const { data: defs } = useCategoryAttributesQuery(categoryForAttrs > 0 ? categoryForAttrs : null);

  const saveM = useMutation({
    mutationFn: async (v: FormIn) => {
      if (isNew) {
        const attrs: Record<string, unknown> = { ...(v.attributes as Record<string, unknown> | undefined) };
        if (v.sell_price && v.sell_price !== '') {
          attrs.price = Number(v.sell_price);
        }
        const body: Parameters<typeof createProduct>[0] = {
          category_id: v.category_id,
          name: v.name,
          sku: v.sku,
          barcode: v.barcode || null,
          status: v.isActive ? 'active' : 'archived',
          attributes: attrs,
          output_vat_rate: v.output_vat_rate,
          sell_price_currency_id: null,
        };
        if (v.sell_price && v.sell_price !== '') {
          body.sell_price = v.sell_price;
        }
        return createProduct(body);
      }
      if (!product) {
        throw new Error('missing product');
      }
      const uattrs: Record<string, unknown> = { ...(v.attributes as Record<string, unknown> | undefined) };
      if (v.sell_price && v.sell_price !== '') {
        uattrs.price = Number(v.sell_price);
      }
      const ubody: Parameters<typeof updateProduct>[1] = {
        category_id: v.category_id,
        name: v.name,
        sku: v.sku,
        barcode: v.barcode || null,
        status: v.isActive ? 'active' : 'archived',
        attributes: uattrs,
        output_vat_rate: v.output_vat_rate,
        sell_price_currency_id: null,
      };
      if (v.sell_price && v.sell_price !== '') {
        ubody.sell_price = v.sell_price;
      } else {
        ubody.sell_price = null;
      }
      return updateProduct(product.id, ubody);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('products.save_ok'));
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : t('errors.generic');
      toast.error(msg);
    },
  });

  const genBar = useMutation({
    mutationFn: async (p: ProductRead) => postGenerateBarcode(p.id),
    onSuccess: (p) => {
      form.setValue('barcode', p.barcode ?? '');
    },
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isNew ? t('products.create') : t('products.edit')}</SheetTitle>
        </SheetHeader>
        {isNew || product ? (
          <FormProvider {...form}>
            <form
              className="mt-4 space-y-4"
              onSubmit={form.handleSubmit((v) => saveM.mutate(v))}
            >
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.field.category')}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={String(field.value)}
                    >
                      <FormControl>
                        <SelectTrigger>
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
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.field.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.field.sku')}</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <Label className="mb-1 block">{t('barcode.label')}</Label>
                <BarcodeRepeater
                  value={form.watch('barcode') ?? ''}
                  onChange={(b) => form.setValue('barcode', b)}
                  {...(!isNew && product ? { onGenerate: () => genBar.mutate(product) } : {})}
                  disabled={!!isNew}
                />
                <p className="mt-1 text-xs text-muted-foreground">{t('barcode.hint')}</p>
              </div>
              <FormField
                control={form.control}
                name="sell_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.field.sell_price')}</FormLabel>
                    <FormControl>
                      <MoneyInput value={field.value ?? ''} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="output_vat_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.field.vat')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="0.15" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <FormLabel>{t('products.field.active')}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">{t('products.attributes')}</p>
                <AttributeFieldset defs={defs} categoryId={categoryForAttrs} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  {t('actions.cancel')}
                </Button>
                <Button type="submit" disabled={saveM.isPending || loadingProduct || (!isNew && !product)}>
                  {t('actions.save')}
                </Button>
              </div>
            </form>
          </FormProvider>
        ) : null}
        {!isNew && !product && !loadingProduct ? <p className="text-sm text-destructive">{t('errors.not_found')}</p> : null}
      </SheetContent>
    </Sheet>
  );
}

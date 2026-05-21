import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { SectionCard } from '@/components/shared/ContentSurface';
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
import { cn } from '@/lib/utils';

import type { TaxDefinitionRead } from '../api';
import { BarcodeRepeater } from './BarcodeRepeater';
import { ProductImageUploadField } from './ProductImageUploadField';

type CategoryOption = { id: number; label: string };

type ProductFormValues = {
  category_id: number;
  tag_category_ids: number[];
  name: string;
  sku?: string | undefined;
  barcode?: string | null | undefined;
  image_url?: string | null | undefined;
  output_vat_rate: string;
  tax_definition_ids: number[];
  attributes?: Record<string, unknown> | undefined;
  isActive: boolean;
};

type Props = {
  form: UseFormReturn<ProductFormValues>;
  flat: CategoryOption[];
  tagOptions: CategoryOption[];
  activeTaxOptions: TaxDefinitionRead[];
  hasVariantAxes: boolean;
  showSimpleBarcode: boolean;
};

export function ProductDataTab({
  form,
  flat,
  tagOptions,
  activeTaxOptions,
  hasVariantAxes,
  showSimpleBarcode,
}: Props) {
  const { t } = useTranslation('catalog');

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

  return (
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
            {showSimpleBarcode && !hasVariantAxes ? (
              <BarcodeRepeater
                value={form.watch('barcode') ?? ''}
                onChange={(b) => form.setValue('barcode', b, { shouldDirty: true })}
              />
            ) : null}
            {hasVariantAxes ? (
              <p className="text-xs text-muted-foreground">{t('products.barcode_on_variants_hint')}</p>
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
  );
}

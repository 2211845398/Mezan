import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { ImageIcon } from 'lucide-react';
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
import { readOnlyTextInputProps } from '@/lib/readOnlyFieldStyles';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';

import type { TaxDefinitionRead } from '../api';
import { CategoryCombobox } from './CategoryCombobox';
import { CategoryTagMultiSelect } from './CategoryTagMultiSelect';
import { ProductImageUploadField } from './ProductImageUploadField';
import { ProductTaxChips } from './ProductTaxChips';
import { TaxDefinitionMultiSelect } from './TaxDefinitionMultiSelect';

type CategoryOption = { id: number; label: string };

type ProductFormValues = {
  category_id: number;
  tag_category_ids: number[];
  name: string;
  sku?: string | undefined;
  image_url?: string | null | undefined;
  output_vat_rate: string;
  tax_definition_ids: number[];
  isActive: boolean;
};

type Props = {
  form: UseFormReturn<ProductFormValues>;
  flat: CategoryOption[];
  tagOptions: CategoryOption[];
  activeTaxOptions: TaxDefinitionRead[];
  fieldsEnabled?: boolean;
  footer?: ReactNode;
};

const wideFieldWidth = 'w-full';

function InnerPanel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-4 rounded-lg border bg-muted/15 p-4 text-start', className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function ProductDataTab({
  form,
  flat,
  tagOptions,
  activeTaxOptions,
  fieldsEnabled = true,
  footer,
}: Props) {
  const { t, i18n } = useTranslation('catalog');
  const textRo = (extra?: string) => readOnlyTextInputProps(fieldsEnabled, extra);
  const [previewSrc, setPreviewSrc] = useState<string | undefined>();
  const tagIds = form.watch('tag_category_ids');
  const imageUrl = form.watch('image_url');
  const outputVatRate = form.watch('output_vat_rate');
  const taxById = useMemo(
    () => new Map(activeTaxOptions.map((d) => [d.id, d] as const)),
    [activeTaxOptions],
  );

  useEffect(() => {
    if (fieldsEnabled) return;
    setPreviewSrc(resolveMediaUrl((imageUrl ?? '').trim() || undefined));
  }, [fieldsEnabled, imageUrl]);

  return (
    <SectionCard
      dir={i18n.dir()}
      className="text-start"
      contentClassName="space-y-4"
    >
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

      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
        <InnerPanel title={t('products.tabs.product_data')} className="lg:h-full">
          <div className="space-y-4">
            <div className="grid w-full grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel className="text-sm">{t('products.field.name')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        dir={i18n.dir()}
                        {...textRo('h-9 w-full text-sm')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel className="text-sm">{t('products.field.status')}</FormLabel>
                    {fieldsEnabled ? (
                      <Select
                        value={field.value ? 'active' : 'archived'}
                        onValueChange={(v) => field.onChange(v === 'active')}
                      >
                        <FormControl>
                          <SelectTrigger className="h-9 w-full text-sm" dir={i18n.dir()}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent dir={i18n.dir()}>
                          <SelectItem value="active">{t('products.status.active')}</SelectItem>
                          <SelectItem value="archived">{t('products.status.archived')}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="flex h-9 items-center text-sm font-medium">
                        {field.value ? t('products.status.active') : t('products.status.archived')}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid w-full max-w-full items-stretch gap-4 sm:grid-cols-[1fr_minmax(14rem,16rem)]">
              <FormField
                control={form.control}
                name="image_url"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel className="text-sm">{t('products.field.image_upload')}</FormLabel>
                    <FormControl>
                      {fieldsEnabled ? (
                        <ProductImageUploadField
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          inputId="product-form-image"
                          layout="controls-only"
                          onDisplaySrcChange={setPreviewSrc}
                        />
                      ) : (
                        <p className="flex h-9 items-center text-sm font-medium">
                          {(field.value ?? '').trim() !== '' ? t('products.image_uploaded') : '—'}
                        </p>
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="relative aspect-square w-full min-h-[14rem] min-w-[14rem] overflow-hidden rounded-lg border bg-muted">
                {previewSrc ? (
                  <img src={previewSrc} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
                    <ImageIcon className="size-10 opacity-40" aria-hidden />
                    <p className="text-center text-xs">{t('products.field.image_upload')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </InnerPanel>

        <InnerPanel title={t('products.section.categories_and_tax')} className="lg:h-full">
          <div className="grid w-full grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel className="text-sm">{t('products.field.primary_category')}</FormLabel>
                  <FormControl>
                    {fieldsEnabled ? (
                      <CategoryCombobox
                        value={field.value}
                        onChange={field.onChange}
                        options={flat}
                      />
                    ) : (
                      <p className="flex h-9 items-center text-sm font-medium">
                        {flat.find((c) => c.id === field.value)?.label ?? '—'}
                      </p>
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="min-w-0 space-y-1">
              <Label className="text-sm">{t('products.field.additional_categories')}</Label>
              {fieldsEnabled ? (
                <FormField
                  control={form.control}
                  name="tag_category_ids"
                  render={({ field }) => (
                    <CategoryTagMultiSelect
                      valueIds={field.value}
                      onChange={field.onChange}
                      options={tagOptions}
                      hideTags
                    />
                  )}
                />
              ) : tagIds.length === 0 ? (
                <p className="flex h-9 items-center text-sm font-medium">—</p>
              ) : null}
            </div>
          </div>

          {tagIds.length > 0 ? (
            <FormField
              control={form.control}
              name="tag_category_ids"
              render={({ field }) => (
                <CategoryTagMultiSelect
                  valueIds={field.value}
                  onChange={field.onChange}
                  options={tagOptions}
                  hideTrigger
                  disabled={!fieldsEnabled}
                />
              )}
            />
          ) : null}

          <div className={cn('space-y-2 border-t pt-4', wideFieldWidth)}>
            <p className="text-sm font-medium">{t('products.tax.title')}</p>
            <FormField
              control={form.control}
              name="tax_definition_ids"
              render={({ field }) =>
                fieldsEnabled ? (
                  <TaxDefinitionMultiSelect
                    valueIds={field.value}
                    onChange={field.onChange}
                    options={activeTaxOptions}
                  />
                ) : (
                  <ProductTaxChips
                    taxDefinitionIds={field.value}
                    outputVatRate={outputVatRate}
                    taxById={taxById}
                  />
                )
              }
            />
          </div>
        </InnerPanel>
      </div>

      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">{footer}</div>
      ) : null}
    </SectionCard>
  );
}

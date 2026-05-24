import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { SectionCard } from '@/components/shared/ContentSurface';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { UnitOfMeasureRead } from '../api';
import {
  formatConversionFactor,
  getConversionHintUnits,
  localizedUomLabel,
  localizedUomName,
  packagingRank,
  parseConversionFactorInput,
} from '../lib/uomConversion';

const RLM = '\u200F';

function ConversionHintText({
  leftName,
  rightName,
  factor,
}: {
  leftName: string;
  rightName: string;
  factor: string;
}) {
  return (
    <span
      dir="rtl"
      className="inline-flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
      style={{ direction: 'rtl', unicodeBidi: 'isolate' }}
    >
      <span dir="ltr" className="num-latin">
        {RLM}1{RLM}
      </span>
      <bdi>{leftName}</bdi>
      <span aria-hidden="true" className="px-0.5">
        =
      </span>
      <span dir="ltr" className="num-latin">
        {RLM}
        {factor}
        {RLM}
      </span>
      <bdi>{rightName}</bdi>
    </span>
  );
}

export type ProductUnitsFormValues = {
  uom_id: number;
  alternative_uoms: Array<{ uom_id: number; factor_to_base: string }>;
};

type Props = {
  form: UseFormReturn<ProductUnitsFormValues & Record<string, unknown>>;
  uoms: UnitOfMeasureRead[];
  footer?: ReactNode;
};

export function ProductUnitsTab({ form, uoms, footer }: Props) {
  const { t, i18n } = useTranslation('catalog');
  const baseUomId = form.watch('uom_id');
  const baseUom = uoms.find((u) => u.id === baseUomId);
  const baseCategory = baseUom?.measurement_category ?? 'discrete';

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'alternative_uoms',
  });

  const altRows = form.watch('alternative_uoms');
  const usedAltIds = new Set(altRows.map((r) => r.uom_id).filter((id) => id > 0));

  const altUomOptions = uoms.filter(
    (u) => u.id !== baseUomId && u.measurement_category === baseCategory,
  );

  const swapRowWithBase = (index: number) => {
    if (!baseUom) return;
    const row = altRows[index];
    if (!row || row.uom_id <= 0) return;
    const altUom = uoms.find((u) => u.id === row.uom_id);
    if (!altUom) return;
    const factor = Number(row.factor_to_base);
    if (!Number.isFinite(factor) || factor <= 0) return;

    form.setValue('uom_id', altUom.id, { shouldDirty: true });
    form.setValue(
      `alternative_uoms.${index}`,
      {
        uom_id: baseUom.id,
        factor_to_base: row.factor_to_base,
      },
      { shouldDirty: true },
    );
  };

  return (
    <SectionCard dir={i18n.dir()} contentClassName="space-y-6">
      <FormField
        control={form.control}
        name="uom_id"
        render={({ field }) => (
          <FormItem className="w-full max-w-[10.5rem]">
            <FormLabel>{t('products.units.base_unit')}</FormLabel>
            <Select
              value={field.value > 0 ? String(field.value) : undefined}
              onValueChange={(v) => {
                field.onChange(Number(v));
                form.setValue('alternative_uoms', [], { shouldDirty: true });
              }}
            >
              <FormControl>
                <SelectTrigger dir={i18n.dir()} className="h-9 w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
              </FormControl>
              <SelectContent dir={i18n.dir()}>
                {uoms.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {localizedUomLabel(t, u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="max-w-xl space-y-3">
        <h3 className="text-sm font-semibold">{t('products.units.alternatives_title')}</h3>

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('products.units.alternatives_empty')}</p>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => {
              const rowUomId = altRows[index]?.uom_id ?? 0;
              const rowUom = uoms.find((u) => u.id === rowUomId);
              const rowOptions = altUomOptions.filter(
                (u) => u.id === rowUomId || !usedAltIds.has(u.id),
              );
              const factorVal = altRows[index]?.factor_to_base ?? '';
              const hint =
                rowUom && baseUom
                  ? getConversionHintUnits(baseUom, rowUom, factorVal)
                  : null;

              const canSwap =
                rowUom &&
                baseUom &&
                packagingRank(rowUom) !== packagingRank(baseUom) &&
                Number(factorVal) > 0;

              return (
                <div
                  key={field.id}
                  dir={i18n.dir()}
                  className="rounded-lg border bg-muted/20 p-3"
                >
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                    <FormField
                      control={form.control}
                      name={`alternative_uoms.${index}.uom_id`}
                      render={({ field: f }) => (
                        <FormItem className="w-full min-w-[9rem] max-w-[11rem] shrink-0 space-y-1">
                          <FormLabel className="text-xs">{t('products.units.alt_unit')}</FormLabel>
                          <Select
                            value={f.value > 0 ? String(f.value) : undefined}
                            onValueChange={(v) => f.onChange(Number(v))}
                          >
                            <FormControl>
                              <SelectTrigger dir={i18n.dir()} className="h-9 w-full">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent dir={i18n.dir()}>
                              {rowOptions.map((u) => (
                                <SelectItem key={u.id} value={String(u.id)}>
                                  {localizedUomLabel(t, u)}
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
                      name={`alternative_uoms.${index}.factor_to_base`}
                      render={({ field: f }) => (
                        <FormItem className="w-full min-w-[5rem] max-w-[6.5rem] shrink-0 space-y-1">
                          <FormLabel className="text-xs">
                            {t('products.units.conversion_factor')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              dir={i18n.dir()}
                              className={cn(
                                'num-latin h-9 w-full',
                                i18n.dir() === 'rtl' && 'text-end',
                              )}
                              value={f.value}
                              onChange={(e) => f.onChange(parseConversionFactorInput(e.target.value))}
                              onBlur={f.onBlur}
                              name={f.name}
                              ref={f.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {hint ? (
                      <div className="flex h-9 shrink-0 items-center">
                        <ConversionHintText
                          leftName={localizedUomName(t, hint.left)}
                          rightName={localizedUomName(t, hint.right)}
                          factor={formatConversionFactor(hint.factor)}
                        />
                      </div>
                    ) : null}
                    <div className="flex h-9 shrink-0 items-center gap-0.5">
                      {canSwap ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          aria-label={t('products.units.swap_units')}
                          title={t('products.units.swap_units')}
                          onClick={() => swapRowWithBase(index)}
                        >
                          <ArrowLeftRight className="size-4" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label={t('products.units.remove_alt')}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={altUomOptions.length <= usedAltIds.size}
          onClick={() => append({ uom_id: 0, factor_to_base: '' })}
        >
          <Plus className="me-1 size-4" />
          {t('products.units.add_alt')}
        </Button>
      </div>

      {footer ? <div className="flex flex-wrap justify-end gap-2 border-t pt-4">{footer}</div> : null}
    </SectionCard>
  );
}

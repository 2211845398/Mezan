import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { FormContainer } from '@/components/shared/ContentSurface';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { handleDialogFormEnterSubmit, handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';

import { archiveTaxDefinition, createTaxDefinition, type TaxDefinitionRead, updateTaxDefinition } from '../../api';
import { catalogKeys } from '../../queries';

const schema = z.object({
  name: z.string().min(1),
  code: z.string().optional().nullable(),
  ratePercent: z
    .string()
    .min(1)
    .refine((v) => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) && n >= 0 && n <= 100;
    }),
});

type Values = z.infer<typeof schema>;

export const TAX_DIALOG_FORM_ID = 'catalog-tax-dialog-form';

type Props = {
  variant?: 'dialog' | 'page';
  existing?: TaxDefinitionRead | null;
  onDismiss?: () => void;
};

function rateFractionToPercent(rate: string): string {
  const n = Number.parseFloat(String(rate));
  if (!Number.isFinite(n)) {
    return '0';
  }
  const pct = n * 100;
  return String(Number.isInteger(pct) ? pct : Math.round(pct * 10000) / 10000);
}

function percentToRateFraction(percent: string): string {
  const n = Number.parseFloat(percent.trim());
  if (!Number.isFinite(n)) {
    return '0';
  }
  return String(n / 100);
}

export default function TaxForm({ variant = 'page', existing, onDismiss }: Props) {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const isEdit = !!existing;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      code: '',
      ratePercent: '0',
    },
  });

  useEffect(() => {
    if (!existing) {
      return;
    }
    form.reset({
      name: existing.name,
      code: existing.code ?? '',
      ratePercent: rateFractionToPercent(existing.rate),
    });
  }, [existing, form]);

  const saveM = useMutation({
    mutationFn: async (v: Values) => {
      const codeTrim = v.code?.trim() ?? '';
      const body = {
        name: v.name.trim(),
        code: codeTrim === '' ? null : codeTrim,
        rate: percentToRateFraction(v.ratePercent),
        is_active: true,
      };
      if (isEdit && existing) {
        return updateTaxDefinition(existing.id, body);
      }
      return createTaxDefinition(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('taxes.save_ok'));
      onDismiss?.();
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const archiveM = useMutation({
    mutationFn: () => (existing ? archiveTaxDefinition(existing.id) : Promise.reject()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('taxes.save_ok'));
      onDismiss?.();
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const inner = (
    <FormProvider {...form}>
      <form
        id={variant === 'dialog' ? TAX_DIALOG_FORM_ID : undefined}
        onSubmit={form.handleSubmit((v) => saveM.mutate(v))}
        onKeyDown={variant === 'dialog' ? handleDialogFormEnterSubmit : handleFormEnterSubmit}
        className={variant === 'dialog' ? 'space-y-4' : 'max-w-xl space-y-4'}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('taxes.field.name')}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('taxes.field.code')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="ratePercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('taxes.field.rate')}</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    {...field}
                    className="num-latin pe-8"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                  <span
                    className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground"
                    aria-hidden
                  >
                    %
                  </span>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {variant === 'page' ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saveM.isPending}>
              {t('actions.save')}
            </Button>
            <Button type="button" variant="outline" onClick={() => onDismiss?.()}>
              {t('actions.cancel')}
            </Button>
            {isEdit && existing?.is_active ? (
              <Button
                type="button"
                variant="destructive"
                disabled={archiveM.isPending}
                onClick={() => {
                  if (window.confirm(t('taxes.archive_confirm'))) {
                    archiveM.mutate();
                  }
                }}
              >
                {t('taxes.archive')}
              </Button>
            ) : null}
          </div>
        ) : isEdit && existing?.is_active ? (
          <Button
            type="button"
            variant="destructive"
            disabled={archiveM.isPending}
            onClick={() => {
              if (window.confirm(t('taxes.archive_confirm'))) {
                archiveM.mutate();
              }
            }}
          >
            {t('taxes.archive')}
          </Button>
        ) : null}
      </form>
    </FormProvider>
  );

  if (variant === 'dialog') {
    return inner;
  }

  return <FormContainer>{inner}</FormContainer>;
}

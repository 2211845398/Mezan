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
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormValidationAlert,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DangerConfirmDialog } from '@/features/admin/components/DangerConfirmDialog';
import { handleDialogFormEnterSubmit, handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import { createFormInvalidHandler } from '@/lib/formValidation';
import { readOnlyTextInputProps } from '@/lib/readOnlyFieldStyles';

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
export const TAX_DETAIL_FORM_ID = 'catalog-tax-detail-form';

type Props = {
  variant?: 'dialog' | 'page';
  existing?: TaxDefinitionRead | null;
  onDismiss?: () => void;
  /** When false, fields are read-only (detail page view mode). */
  fieldsEnabled?: boolean;
  hideFooter?: boolean;
  formId?: string;
  archiveOpen?: boolean;
  onArchiveOpenChange?: (open: boolean) => void;
  onSaved?: () => void;
  onArchived?: () => void;
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

export default function TaxForm({
  variant = 'page',
  existing,
  onDismiss,
  fieldsEnabled = true,
  hideFooter = false,
  formId: formIdProp,
  archiveOpen = false,
  onArchiveOpenChange,
  onSaved,
  onArchived,
}: Props) {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const isEdit = !!existing;
  const textRo = (extra?: string) => readOnlyTextInputProps(fieldsEnabled, extra);
  const resolvedFormId =
    formIdProp ?? (variant === 'dialog' ? TAX_DIALOG_FORM_ID : isEdit ? TAX_DETAIL_FORM_ID : undefined);

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

  const onInvalid = createFormInvalidHandler(form, {
    fieldOrder: ['name', 'code', 'ratePercent'],
  });

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
      onSaved?.();
      onDismiss?.();
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const archiveM = useMutation({
    mutationFn: () => (existing ? archiveTaxDefinition(existing.id) : Promise.reject()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('taxes.save_ok'));
      onArchiveOpenChange?.(false);
      onArchived?.();
      onDismiss?.();
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const inner = (
    <FormProvider {...form}>
      <form
        id={resolvedFormId}
        onSubmit={form.handleSubmit((v) => saveM.mutate(v), onInvalid)}
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
                <Input
                  {...field}
                  autoComplete="off"
                  readOnly={textRo().readOnly}
                  disabled={textRo().disabled}
                  tabIndex={textRo().tabIndex}
                  className={textRo().className}
                />
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
                <Input
                  {...field}
                  value={field.value ?? ''}
                  autoComplete="off"
                  readOnly={textRo().readOnly}
                  disabled={textRo().disabled}
                  tabIndex={textRo().tabIndex}
                  className={textRo().className}
                />
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
                    className={textRo('num-latin pe-8').className}
                    inputMode="decimal"
                    autoComplete="off"
                    readOnly={textRo().readOnly}
                    disabled={textRo().disabled}
                    tabIndex={textRo().tabIndex}
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
        <FormValidationAlert />
        {!hideFooter && variant === 'page' ? (
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
                onClick={() => onArchiveOpenChange?.(true)}
              >
                {t('taxes.archive')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>
      {isEdit && existing?.is_active && onArchiveOpenChange ? (
        <DangerConfirmDialog
          open={archiveOpen}
          onOpenChange={onArchiveOpenChange}
          title={t('taxes.archive')}
          confirmKeyword={t('taxes.archive')}
          isLoading={archiveM.isPending}
          onConfirm={() => archiveM.mutate()}
        />
      ) : null}
    </FormProvider>
  );

  if (variant === 'dialog') {
    return inner;
  }

  return hideFooter ? inner : <FormContainer>{inner}</FormContainer>;
}

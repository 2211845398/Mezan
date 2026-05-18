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
import { Switch } from '@/components/ui/switch';

import { archiveTaxDefinition, createTaxDefinition, type TaxDefinitionRead, updateTaxDefinition } from '../../api';
import { catalogKeys } from '../../queries';

const schema = z.object({
  name: z.string().min(1),
  code: z.string().optional().nullable(),
  rate: z.string().min(1),
  is_active: z.boolean(),
});

type Values = z.infer<typeof schema>;

type Props = {
  variant?: 'dialog' | 'page';
  existing?: TaxDefinitionRead | null;
  onDismiss?: () => void;
};

function rateToFormString(rate: string): string {
  const n = Number.parseFloat(String(rate));
  if (!Number.isFinite(n)) {
    return '0';
  }
  return String(n);
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
      rate: '0',
      is_active: true,
    },
  });

  useEffect(() => {
    if (!existing) {
      return;
    }
    form.reset({
      name: existing.name,
      code: existing.code ?? '',
      rate: rateToFormString(existing.rate),
      is_active: existing.is_active,
    });
  }, [existing, form]);

  const saveM = useMutation({
    mutationFn: async (v: Values) => {
      const codeTrim = v.code?.trim() ?? '';
      const body = {
        name: v.name.trim(),
        code: codeTrim === '' ? null : codeTrim,
        rate: v.rate.trim(),
        is_active: v.is_active,
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
        onSubmit={form.handleSubmit((v) => saveM.mutate(v))}
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
          name="rate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('taxes.field.rate')}</FormLabel>
              <FormControl>
                <Input {...field} className="num-latin" inputMode="decimal" autoComplete="off" />
              </FormControl>
              <p className="text-muted-foreground text-xs">{t('taxes.field.rate_hint')}</p>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>{t('taxes.field.active')}</FormLabel>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saveM.isPending}>
            {t('actions.save')}
          </Button>
          {variant === 'page' ? (
            <Button type="button" variant="outline" onClick={() => onDismiss?.()}>
              {t('actions.cancel')}
            </Button>
          ) : null}
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
      </form>
    </FormProvider>
  );

  if (variant === 'dialog') {
    return inner;
  }

  return <FormContainer>{inner}</FormContainer>;
}

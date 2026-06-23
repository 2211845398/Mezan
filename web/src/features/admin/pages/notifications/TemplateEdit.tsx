import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
  FloatingFormDialog,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormValidationAlert,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';
import { createFormInvalidHandler } from '@/lib/formValidation';

import { useNotificationTemplates, useUpsertTemplate } from '../../queries';

const schema = z.object({
  kind: z.string().min(1),
  title_template: z.string().min(1),
  body_template: z.string().min(1),
  is_active: z.boolean(),
  default_data_json: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = 'admin-notification-template-form';

type Props = {
  kind: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

export function TemplateEdit({ kind, open, onOpenChange }: Props) {
  const { t } = useTranslation('admin');
  const { data: items = [] } = useNotificationTemplates();
  const row = kind ? items.find((x) => x.kind === kind) : undefined;
  const upsert = useUpsertTemplate();
  const can = usePermission('notifications', 'update');
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: '',
      title_template: '',
      body_template: '',
      is_active: true,
      default_data_json: '{}',
    },
  });

  useEffect(() => {
    if (row) {
      form.reset({
        kind: row.kind,
        title_template: row.title_template,
        body_template: row.body_template,
        is_active: row.is_active,
        default_data_json: JSON.stringify(row.default_data ?? {}, null, 0),
      });
    } else {
      form.reset({
        kind: kind ?? '',
        title_template: '',
        body_template: '',
        is_active: true,
        default_data_json: '{}',
      });
    }
  }, [row, open, form, kind]);

  const onInvalid = createFormInvalidHandler(form, {
    fieldOrder: ['kind', 'title_template', 'body_template', 'default_data_json'],
  });

  const title = kind ? t('notifications.edit_template') : t('notifications.create_template');

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      maxWidth="lg"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-[5px]">
          <Button
            type="button"
            variant="outline"
            className={floatingFormCloseButtonClassName}
            onClick={() => onOpenChange(false)}
            disabled={upsert.isPending}
          >
            {t('actions.cancel')}
          </Button>
          {can ? (
            <Button
              type="submit"
              form={FORM_ID}
              className={floatingFormApproveButtonClassName}
              disabled={upsert.isPending}
            >
              {t('actions.save')}
            </Button>
          ) : null}
        </div>
      }
    >
      {can ? (
        <Form {...form}>
          <form
            id={FORM_ID}
            onSubmit={form.handleSubmit(async (v) => {
              let default_data: Record<string, unknown> = {};
              try {
                default_data = JSON.parse(v.default_data_json || '{}') as Record<string, unknown>;
              } catch {
                return;
              }
              await upsert.mutateAsync({
                kind: v.kind,
                title_template: v.title_template,
                body_template: v.body_template,
                default_data,
                is_active: v.is_active,
              });
              notify.success(t('notifications.template_saved'));
              onOpenChange(false);
            }, onInvalid)}
            className="space-y-3"
          >
            <FormField
              name="kind"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>kind</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!!row} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="title_template"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('notifications.col.title_tpl')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="body_template"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>body</FormLabel>
                  <FormControl>
                    <Textarea className="min-h-[100px] font-mono text-xs" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="default_data_json"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>default_data (JSON)</FormLabel>
                  <FormControl>
                    <Textarea className="min-h-[80px] font-mono text-xs" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="is_active"
              control={form.control}
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} id="tactive" />
                  </FormControl>
                  <FormLabel htmlFor="tactive">{t('notifications.col.active')}</FormLabel>
                </FormItem>
              )}
            />
            <FormValidationAlert />
          </form>
        </Form>
      ) : null}
    </FloatingFormDialog>
  );
}

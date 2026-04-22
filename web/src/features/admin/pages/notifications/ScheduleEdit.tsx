import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';

import { useUpsertSchedule } from '../../queries';
import type { NotificationScheduleRead } from '../../types';

const schema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  interval_minutes: z.coerce.number().min(1),
  target_role_code: z.string().optional().nullable(),
  branch_id: z.string().optional(),
  is_active: z.boolean(),
  parameters_json: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  row: NotificationScheduleRead | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

export function ScheduleEdit({ row, open, onOpenChange }: Props) {
  const { t } = useTranslation('admin');
  const upsert = useUpsertSchedule();
  const can = usePermission('config', 'update');
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      kind: '',
      interval_minutes: 60,
      target_role_code: null,
      branch_id: '',
      is_active: true,
      parameters_json: '{}',
    },
  });

  useEffect(() => {
    if (row) {
      form.reset({
        name: row.name,
        kind: row.kind,
        interval_minutes: row.interval_minutes,
        target_role_code: row.target_role_code,
        branch_id: row.branch_id != null ? String(row.branch_id) : '',
        is_active: row.is_active,
        parameters_json: JSON.stringify(row.parameters ?? {}, null, 0),
      });
    } else {
      form.reset({
        name: '',
        kind: '',
        interval_minutes: 60,
        target_role_code: null,
        branch_id: '',
        is_active: true,
        parameters_json: '{}',
      });
    }
  }, [row, form, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {row ? t('notifications.edit_schedule') : t('notifications.create_schedule')}
          </SheetTitle>
        </SheetHeader>
        {can ? (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(async (v) => {
                let parameters: Record<string, unknown> = {};
                try {
                  parameters = JSON.parse(v.parameters_json || '{}') as Record<string, unknown>;
                } catch {
                  return;
                }
                await upsert.mutateAsync({
                  name: v.name,
                  kind: v.kind,
                  interval_minutes: v.interval_minutes,
                  target_role_code: v.target_role_code || null,
                  branch_id: v.branch_id ? Number(v.branch_id) : null,
                  parameters,
                  is_active: v.is_active,
                });
                onOpenChange(false);
              })}
              className="mt-4 space-y-3"
            >
              <FormField
                name="name"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                name="interval_minutes"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('notifications.interval')}</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="target_role_code"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('notifications.target_role')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                name="branch_id"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>branch_id</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                name="parameters_json"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>parameters (JSON)</FormLabel>
                    <FormControl>
                      <Textarea className="min-h-[80px] font-mono text-xs" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                name="is_active"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} id="sact" />
                    </FormControl>
                    <FormLabel htmlFor="sact">{t('notifications.col.active')}</FormLabel>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={upsert.isPending}>
                {t('actions.save')}
              </Button>
            </form>
          </Form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

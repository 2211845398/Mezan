import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import {
  FloatingFormDialog,
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import type { BranchRead } from '../../types';

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  timezone: z.string().min(1),
  address: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

const BRANCH_FORM_ID = 'admin-branch-float-form';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  branch: BranchRead | null;
  onSubmit: (values: FormValues) => Promise<void>;
  isSubmitting?: boolean;
  mode: 'create' | 'edit';
};

export function BranchForm({
  open,
  onOpenChange,
  branch,
  onSubmit,
  isSubmitting,
  mode,
}: Props) {
  const { t } = useTranslation('admin');
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', timezone: 'UTC', address: '' },
  });

  useEffect(() => {
    if (branch && mode === 'edit') {
      form.reset({
        code: branch.code,
        name: branch.name,
        timezone: branch.timezone,
        address: branch.address ?? '',
      });
    } else {
      form.reset({ code: '', name: '', timezone: 'UTC', address: '' });
    }
  }, [branch, mode, form, open]);

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'create' ? t('branches.create_title') : t('branches.edit_title')}
      maxWidth="md"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className={floatingFormCloseButtonClassName}
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            type="submit"
            form={BRANCH_FORM_ID}
            className={floatingFormApproveButtonClassName}
            disabled={isSubmitting}
          >
            {t('actions.save')}
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form
          id={BRANCH_FORM_ID}
          onSubmit={form.handleSubmit((v) => onSubmit({ ...v, address: v.address || null }))}
          className="space-y-3"
        >
          <FormField
            name="code"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('branches.col.code')}</FormLabel>
                <FormControl>
                  <Input {...field} disabled={mode === 'edit'} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="name"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('branches.col.name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="timezone"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('branches.col.timezone')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="address"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('branches.col.address')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FloatingFormDialog>
  );
}

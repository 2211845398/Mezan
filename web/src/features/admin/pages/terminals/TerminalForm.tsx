import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { applyApiErrorToForm, notifyApiError } from '@/api/errorMessages';
import {
  floatingFormApproveButtonClassName,
  floatingFormApproveButtonSmClassName,
  floatingFormCloseButtonClassName,
  floatingFormDangerButtonSmClassName,
  FloatingFormDialog,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { notify } from '@/lib/toast';

import { BranchPicker } from '../../components/BranchPicker';
import { useAuthorizeTerminal, useCreateTerminal, useDeauthorizeTerminal, useUpdateTerminal } from '../../queries';
import type { TerminalRead } from '../../types';

const createSchema = z.object({
  branch_id: z.coerce.number().refine((n) => n > 0, 'Required'),
  name: z.string().min(1),
  terminal_code: z.string().min(1),
});

const editSchema = z.object({
  branch_id: z.coerce.number().min(1),
  name: z.string().min(1),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

const CREATE_FORM_ID = 'admin-terminal-create-form';
const EDIT_FORM_ID = 'admin-terminal-edit-form';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  terminal: TerminalRead | null;
};

export function TerminalForm({ open, onOpenChange, terminal }: Props) {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const isEdit = Boolean(terminal);
  const create = useCreateTerminal();
  const update = useUpdateTerminal(terminal?.id ?? 0);
  const authz = useAuthorizeTerminal(terminal?.id ?? 0);
  const deauthz = useDeauthorizeTerminal(terminal?.id ?? 0);
  const canAuthz = usePermission('terminals', 'authorize');
  const canUpdate = usePermission('terminals', 'update');

  const cForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { branch_id: 0, name: '', terminal_code: '' } as CreateValues,
  });
  const eForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { branch_id: 0, name: '' },
  });

  useEffect(() => {
    if (terminal) {
      eForm.reset({ branch_id: terminal.branch_id, name: terminal.name });
    } else {
      cForm.reset({ branch_id: 0, name: '', terminal_code: '' });
    }
  }, [terminal, open, cForm, eForm]);

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t('terminals.edit_title') : t('terminals.create_title')}
      maxWidth="md"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className={floatingFormCloseButtonClassName}
            onClick={() => onOpenChange(false)}
            disabled={create.isPending || update.isPending}
          >
            {t('actions.cancel')}
          </Button>
          {isEdit && canUpdate ? (
            <Button
              type="submit"
              form={EDIT_FORM_ID}
              className={floatingFormApproveButtonClassName}
              disabled={update.isPending}
            >
              {t('actions.save')}
            </Button>
          ) : null}
          {!isEdit ? (
            <Button
              type="submit"
              form={CREATE_FORM_ID}
              className={floatingFormApproveButtonClassName}
              disabled={create.isPending}
            >
              {t('actions.create')}
            </Button>
          ) : null}
        </div>
      }
    >
      {isEdit && terminal ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {t('terminals.col.code')}: {terminal.terminal_code}
          </p>
          {terminal.last_seen_at ? (
            <p className="text-xs text-muted-foreground">
              {t('terminals.last_seen')}: {formatIso(terminal.last_seen_at, 'yyyy-MM-dd HH:mm')}
            </p>
          ) : null}
          <Form {...eForm}>
            <form
              id={EDIT_FORM_ID}
              onSubmit={eForm.handleSubmit(async (v) => {
                try {
                  await update.mutateAsync(v);
                  notify.success(tc('toasts.saved'));
                } catch (error) {
                  const message = applyApiErrorToForm(eForm, error);
                  if (message) notifyApiError(error, tc('errors.generic'));
                }
              })}
              className="space-y-3"
            >
              <FormField
                name="name"
                control={eForm.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('terminals.col.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="branch_id"
                control={eForm.control}
                render={({ field }) => (
                  <FormItem>
                    <BranchPicker
                      label={t('terminals.col.branch')}
                      value={field.value}
                      onChange={(b) => field.onChange(b ?? 0)}
                    />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {canAuthz && !terminal.is_authorized ? (
              <Button
                type="button"
                className={floatingFormApproveButtonSmClassName}
                disabled={authz.isPending}
                onClick={() =>
                  void authz
                    .mutateAsync()
                    .then(() => notify.success(tc('toasts.saved')))
                    .catch((error) => notifyApiError(error, tc('errors.generic')))
                }
              >
                {t('terminals.authorize')}
              </Button>
            ) : null}
            {canUpdate && terminal.is_authorized ? (
              <Button
                type="button"
                className={floatingFormDangerButtonSmClassName}
                disabled={deauthz.isPending}
                onClick={() =>
                  void deauthz
                    .mutateAsync()
                    .then(() => notify.success(tc('toasts.saved')))
                    .catch((error) => notifyApiError(error, tc('errors.generic')))
                }
              >
                {t('terminals.deauthorize')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <Form {...cForm}>
          <form
            id={CREATE_FORM_ID}
            onSubmit={cForm.handleSubmit(async (v) => {
              try {
                const res = await create.mutateAsync(v);
                notify.success(tc('toasts.saved'));
                window.alert(
                  t('terminals.api_key_once', { key: (res as { api_key?: string }).api_key ?? '' }),
                );
                onOpenChange(false);
              } catch (error) {
                const message = applyApiErrorToForm(cForm, error);
                if (message) notifyApiError(error, tc('errors.generic'));
              }
            })}
            className="space-y-3"
          >
            <FormField
              name="terminal_code"
              control={cForm.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('terminals.col.code')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="name"
              control={cForm.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('terminals.col.name')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="branch_id"
              control={cForm.control}
              render={({ field }) => (
                <FormItem>
                  <BranchPicker
                    label={t('terminals.col.branch')}
                    value={field.value || null}
                    onChange={(b) => field.onChange(b ?? 0)}
                  />
                </FormItem>
              )}
            />
          </form>
        </Form>
      )}
    </FloatingFormDialog>
  );
}

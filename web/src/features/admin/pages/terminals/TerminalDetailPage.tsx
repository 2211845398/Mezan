import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { z } from 'zod';

import { applyApiErrorToForm, notifyApiError } from '@/api/errorMessages';
import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { ReadOnlyCopyableField } from '@/components/shared/form/ReadOnlyCopyableField';
import { FormContainer } from '@/components/shared/ContentSurface';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import {
  detailHeaderDangerOutlineButtonClassName,
  floatingFormApproveButtonSmClassName,
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
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { createFormInvalidHandler } from '@/lib/formValidation';
import { readOnlyTextInputProps } from '@/lib/readOnlyFieldStyles';
import { notify } from '@/lib/toast';
import { useEditableFormMode } from '@/lib/useEditableFormMode';
import RouteLoader from '@/routes/RouteLoader';

import { BranchPicker } from '../../components/BranchPicker';
import { getBranchLabel } from '../../lib/branchLabels';
import { useBranches } from '../../queries';
import {
  useAuthorizeTerminal,
  useDeauthorizeTerminal,
  useTerminals,
  useUpdateTerminal,
} from '../../queries';

const editSchema = z.object({
  branch_id: z.coerce.number().min(1),
  name: z.string().min(1),
});

type EditValues = z.infer<typeof editSchema>;

const TERMINAL_DETAIL_FORM_ID = 'admin-terminal-detail-form';

export default function TerminalDetailPage() {
  const { t, i18n } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const terminalId = Number(id);
  const canAuthz = usePermission('terminals', 'authorize');
  const canUpdate = usePermission('terminals', 'update');
  const { data: terms = [], isLoading } = useTerminals();
  const terminal = terms.find((term) => term.id === terminalId);
  const update = useUpdateTerminal(terminalId);
  const authz = useAuthorizeTerminal(terminalId);
  const deauthz = useDeauthorizeTerminal(terminalId);

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { branch_id: 0, name: '' },
  });

  const editMode = useEditableFormMode({ form, canEdit: canUpdate });
  const { data: branches = [] } = useBranches(true);
  const branchIdValue = form.watch('branch_id');

  useEffect(() => {
    if (!terminal) return;
    form.reset({ branch_id: terminal.branch_id, name: terminal.name });
    editMode.syncSnapshot();
  }, [terminal, form, editMode.syncSnapshot]);

  const onInvalid = createFormInvalidHandler(form, {
    fieldOrder: ['name', 'branch_id'],
  });

  if (!Number.isFinite(terminalId)) {
    return <p className="p-4">{t('terminals.empty')}</p>;
  }
  if (isLoading) return <RouteLoader />;
  if (!terminal) return <p className="p-4">{t('terminals.empty')}</p>;

  const textRo = (extra?: string) => readOnlyTextInputProps(editMode.fieldsEnabled, extra);
  const branchDisplayLabel = getBranchLabel(
    branches,
    branchIdValue ?? null,
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={terminal.name}
        subtitle={terminal.terminal_code}
        actions={
          <>
            <BackButton to="/admin/terminals" label={t('terminals.title')} />
            <DetailFormActionBar
              isEditing={editMode.isEditing}
              canEdit={canUpdate}
              isSubmitting={update.isPending}
              formId={TERMINAL_DETAIL_FORM_ID}
              onStartEdit={editMode.startEdit}
              onCancelEdit={editMode.cancelEdit}
            />
          </>
        }
      />

      <FormContainer maxWidth="lg">
        <p className="text-muted-foreground mb-4 text-sm">
          {t('terminals.col.status')}:{' '}
          {terminal.is_authorized
            ? t('terminals.status.authorized')
            : t('terminals.status.unauthorized')}
        </p>
        {terminal.last_seen_at ? (
          <p className="text-muted-foreground mb-4 text-xs">
            {t('terminals.last_seen')}: {formatIso(terminal.last_seen_at, 'yyyy-MM-dd HH:mm')}
          </p>
        ) : null}

        <Form {...form}>
          <form
            id={TERMINAL_DETAIL_FORM_ID}
            dir={i18n.dir()}
            onSubmit={form.handleSubmit(async (v) => {
              try {
                await update.mutateAsync(v);
                notify.success(tc('toasts.saved'));
                editMode.finishEdit();
              } catch (error) {
                applyApiErrorToForm(form, error);
                notifyApiError(error, tc('errors.generic'));
              }
            }, onInvalid)}
            className="space-y-4"
          >
            <FormField
              name="name"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('terminals.col.name')}</FormLabel>
                  <FormControl>
                    <Input {...field} {...textRo()} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="branch_id"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('terminals.col.branch')}</FormLabel>
                  <FormControl>
                    {editMode.fieldsEnabled ? (
                      <BranchPicker
                        value={field.value}
                        onChange={field.onChange}
                      />
                    ) : (
                      <ReadOnlyCopyableField
                        value={terminal.branch_name?.trim() || branchDisplayLabel}
                        dir={i18n.dir()}
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormValidationAlert />
          </form>
        </Form>

        {canAuthz ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {terminal.is_authorized ? (
              <Button
                type="button"
                variant="outline"
                className={detailHeaderDangerOutlineButtonClassName}
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
            ) : (
              <Button
                type="button"
                size="sm"
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
            )}
          </div>
        ) : null}
      </FormContainer>
    </div>
  );
}

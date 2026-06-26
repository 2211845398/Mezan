import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';

import { notifyApiError } from '@/api/errorMessages';
import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { ReadOnlyCopyableField } from '@/components/shared/form/ReadOnlyCopyableField';
import { FormContainer } from '@/components/shared/ContentSurface';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DangerConfirmDialog } from '@/features/admin/components/DangerConfirmDialog';
import { usePermission } from '@/hooks/usePermission';
import { handleFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import { createFormInvalidHandler } from '@/lib/formValidation';
import { readOnlyTextInputProps } from '@/lib/readOnlyFieldStyles';
import { notify } from '@/lib/toast';
import { useEditableFormMode } from '@/lib/useEditableFormMode';
import RouteLoader from '@/routes/RouteLoader';

import { updateBranch } from '../../api';
import { adminKeys, useArchiveBranch, useBranch, useUpdateBranch } from '../../queries';

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  timezone: z.string().min(1),
  address: z.string().optional().nullable(),
  kind: z.enum(['commercial', 'warehouse']),
});

type FormValues = z.infer<typeof schema>;

const BRANCH_DETAIL_FORM_ID = 'admin-branch-detail-form';

export default function BranchDetail() {
  const { t, i18n } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const branchId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canUpdate = usePermission('branches', 'update');
  const canDelete = usePermission('branches', 'delete');
  const { data: branch, isLoading, isError } = useBranch(branchId, {
    enabled: Number.isFinite(branchId),
  });
  const updateB = useUpdateBranch(branchId);
  const archive = useArchiveBranch(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const unarchive = useMutation({
    mutationFn: () => updateBranch(branchId, { unarchive: true }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.branches(false) });
      await qc.invalidateQueries({ queryKey: adminKeys.branches(true) });
      notify.success(tc('toasts.restored'));
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', timezone: 'UTC', address: '', kind: 'commercial' },
  });

  const editMode = useEditableFormMode({ form, canEdit: canUpdate });

  useEffect(() => {
    if (!branch) return;
    form.reset({
      code: branch.code,
      name: branch.name,
      timezone: branch.timezone,
      address: branch.address ?? '',
      kind: branch.kind ?? 'commercial',
    });
    editMode.syncSnapshot();
  }, [branch, form, editMode.syncSnapshot]);

  const onInvalid = createFormInvalidHandler(form, {
    fieldOrder: ['code', 'name', 'kind', 'timezone', 'address'],
  });

  if (!Number.isFinite(branchId) || isError) {
    return <p className="p-4 text-destructive">{t('branches.empty')}</p>;
  }
  if (isLoading || !branch) {
    return <RouteLoader />;
  }

  const isArchived = Boolean(branch.archived_at);
  const textRo = (extra?: string) => readOnlyTextInputProps(editMode.fieldsEnabled, extra);
  const kindValue = form.watch('kind');
  const kindDisplayLabel =
    kindValue === 'warehouse' ? t('branches.kind.warehouse') : t('branches.kind.commercial');

  const secondaryActions = [];
  if (canDelete && !isArchived) {
    secondaryActions.push({
      id: 'archive',
      label: t('branches.archive'),
      variant: 'destructive' as const,
      onClick: () => setArchiveOpen(true),
    });
  }
  if (canUpdate && isArchived) {
    secondaryActions.push({
      id: 'unarchive',
      label: t('branches.unarchive'),
      onClick: () =>
        void unarchive
          .mutateAsync()
          .catch((error) => notifyApiError(error, t('errors.generic', { ns: 'common' }))),
      disabled: unarchive.isPending,
    });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={branch.name}
        subtitle={branch.code}
        actions={
          <>
            <BackButton to="/admin/branches" label={t('branches.title')} />
            <DetailFormActionBar
              isEditing={editMode.isEditing}
              canEdit={canUpdate}
              isSubmitting={updateB.isPending}
              formId={BRANCH_DETAIL_FORM_ID}
              onStartEdit={editMode.startEdit}
              onCancelEdit={editMode.cancelEdit}
              secondaryActions={secondaryActions}
            />
          </>
        }
      />

      <FormContainer maxWidth="lg">
        <Form {...form}>
          <form
            id={BRANCH_DETAIL_FORM_ID}
            dir={i18n.dir()}
            onKeyDown={handleFormEnterSubmit}
            onSubmit={form.handleSubmit(async (v) => {
              try {
                await updateB.mutateAsync({ ...v, address: v.address || null });
                notify.success(tc('toasts.saved'));
                editMode.finishEdit();
              } catch (error) {
                notifyApiError(error, tc('errors.generic'));
              }
            }, onInvalid)}
            className="space-y-4"
          >
            <fieldset disabled={updateB.isPending} className="space-y-4">
              <FormField
                name="code"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('branches.col.code')}</FormLabel>
                    <FormControl>
                      <Input {...field} {...readOnlyTextInputProps(false)} />
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
                      <Input
                        {...field}
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
                name="kind"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('branches.col.kind')}</FormLabel>
                    {editMode.fieldsEnabled ? (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent dir={i18n.dir()}>
                          <SelectItem value="commercial">{t('branches.kind.commercial')}</SelectItem>
                          <SelectItem value="warehouse">{t('branches.kind.warehouse')}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        <ReadOnlyCopyableField value={kindDisplayLabel} dir={i18n.dir()} />
                      </FormControl>
                    )}
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
                      <Input
                        {...field}
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
                name="address"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('branches.col.address')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        readOnly={textRo().readOnly}
                        disabled={textRo().disabled}
                        tabIndex={textRo().tabIndex}
                        className={textRo().className}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormValidationAlert />
            </fieldset>
          </form>
        </Form>
      </FormContainer>

      <DangerConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t('branches.archive_title')}
        confirmKeyword={t('branches.archive_confirm_keyword')}
        isLoading={archive.isPending}
        onConfirm={() =>
          void archive
            .mutateAsync({ branchId })
            .then(() => {
              notify.success(tc('toasts.archived'));
              setArchiveOpen(false);
              navigate('/admin/branches');
            })
            .catch((error) => notifyApiError(error, t('errors.generic', { ns: 'common' })))
        }
      />
    </div>
  );
}

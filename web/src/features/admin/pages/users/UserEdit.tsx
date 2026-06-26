import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';

import { applyApiErrorToForm, notifyApiError } from '@/api/errorMessages';
import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { ReadOnlyCopyableField } from '@/components/shared/form/ReadOnlyCopyableField';
import { BackButton } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { createFormInvalidHandler } from '@/lib/formValidation';
import { readOnlyTextInputProps } from '@/lib/readOnlyFieldStyles';
import { notify } from '@/lib/toast';
import { useEditableFormMode } from '@/lib/useEditableFormMode';
import RouteLoader from '@/routes/RouteLoader';

import { BranchCombobox } from '../../components/BranchCombobox';
import { getBranchDisplayName } from '../../lib/branchLabels';
import { DangerConfirmDialog } from '../../components/DangerConfirmDialog';
import { RoleIdCombobox } from '../../components/RoleCodeCombobox';
import { roleCodeLabel } from '../../lib/roleLabels';
import {
  useAddUserRole,
  useRemoveUserRole,
  useRequestPasswordReset,
  useUpdateUser,
  useUser,
  useUserRoles,
  useBranches,
} from '../../queries';
import type { UserRoleAssign } from '../../types';

const schema = z.object({
  first_name: z.string().max(255).optional().nullable(),
  father_name: z.string().max(255).optional().nullable(),
  family_name: z.string().max(255).optional().nullable(),
  status: z.string(),
  branch_id: z.coerce.number().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

const statusOptions = [
  'active',
  'awaiting_verification',
  'deactivated',
  'suspended',
  'banned',
  'pending_onboarding',
] as const;

const USER_EDIT_FORM_ID = 'admin-user-edit-form';

export default function UserEdit() {
  const { t, i18n } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const userId = Number(id);
  const { data: user, isLoading, isError } = useUser(userId, { enabled: Number.isFinite(userId) });
  const { data: userRoles = [], refetch: refetchRoles } = useUserRoles(userId, {
    enabled: Number.isFinite(userId),
  });
  const update = useUpdateUser(userId);
  const addRole = useAddUserRole(userId);
  const removeRole = useRemoveUserRole(userId);
  const requestReset = useRequestPasswordReset();
  const canUpdate = usePermission('users', 'update');
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [addRoleId, setAddRoleId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const editMode = useEditableFormMode({ form, canEdit: canUpdate });
  const { data: branches = [] } = useBranches(true);
  const branchId = form.watch('branch_id');
  const statusValue = form.watch('status');

  useEffect(() => {
    if (!user) return;
    const locked = user.bootstrap_admin_protected === true;
    form.reset({
      first_name: user.first_name,
      father_name: user.father_name,
      family_name: user.family_name,
      status: locked ? 'active' : user.status,
      branch_id: user.branch_id,
    });
    editMode.syncSnapshot();
  }, [user, form, editMode.syncSnapshot]);

  if (!Number.isFinite(userId) || isError) {
    return <p className="p-4 text-destructive">{t('users.not_found')}</p>;
  }
  if (isLoading || !user) {
    return <RouteLoader />;
  }

  const bootstrapLocked = user.bootstrap_admin_protected === true;
  const isDeactivated = user.status === 'deactivated';
  const isSelf = user.id === currentUserId;
  const statusAction: 'activate' | 'deactivate' = isDeactivated ? 'activate' : 'deactivate';
  const onInvalid = createFormInvalidHandler(form, {
    fieldOrder: ['first_name', 'father_name', 'family_name', 'status', 'branch_id'],
  });

  const textRo = (extra?: string) => readOnlyTextInputProps(editMode.fieldsEnabled, extra);
  const branchDisplayLabel = getBranchDisplayName(branches, branchId ?? null, user.branch_name);
  const statusDisplayLabel = t(`users.user_status.${statusValue}`, { defaultValue: statusValue });

  const secondaryActions = [];
  if (canUpdate && !bootstrapLocked && !isSelf) {
    secondaryActions.push({
      id: 'status',
      label: isDeactivated ? t('users.activate') : t('users.deactivate'),
      variant: isDeactivated ? ('outline' as const) : ('destructive' as const),
      onClick: () => setStatusDialogOpen(true),
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('users.edit_title')}</h1>
        <div dir="ltr" className="flex flex-wrap items-center gap-[5px]">
          <BackButton to="/admin/users" label={t('users.title')} />
          <DetailFormActionBar
            isEditing={editMode.isEditing}
            canEdit={canUpdate}
            isSubmitting={update.isPending}
            formId={USER_EDIT_FORM_ID}
            onStartEdit={editMode.startEdit}
            onCancelEdit={editMode.cancelEdit}
            secondaryActions={secondaryActions}
          />
        </div>
      </div>

      <section className="bg-card space-y-5 rounded-2xl border px-6 py-6 shadow-sm sm:px-8 sm:py-8">
        <h2 className="text-lg font-semibold">{t('users.edit_form_section')}</h2>

        <Form {...form}>
          <form
            id={USER_EDIT_FORM_ID}
            className="space-y-5"
            dir={i18n.dir()}
            onSubmit={form.handleSubmit(async (v) => {
              setFormError(null);
              try {
                await update.mutateAsync({
                  first_name: v.first_name == null || v.first_name === '' ? null : v.first_name,
                  father_name: v.father_name == null || v.father_name === '' ? null : v.father_name,
                  family_name: v.family_name == null || v.family_name === '' ? null : v.family_name,
                  status: bootstrapLocked ? 'active' : v.status,
                  branch_id: v.branch_id == null ? null : v.branch_id,
                });
                notify.success(tc('toasts.saved'));
                editMode.finishEdit();
              } catch (error) {
                setFormError(applyApiErrorToForm(form, error) ?? tc('errors.validation'));
              }
            }, onInvalid)}
          >
            <fieldset disabled={update.isPending} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {/* Email - Read only, dark gray, paste only */}
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  {t('users.col.email')}
                </Label>
                <Input
                  value={user.email}
                  readOnly
                  onPaste={(e) => {
                    e.preventDefault();
                    alert(t('users.email_readonly_hint'));
                  }}
                  className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                  dir="ltr"
                />
              </div>

              <FormField
                name="first_name"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.col.first_name')}</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="father_name"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.col.father_name')}</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="family_name"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.col.family_name')}</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {bootstrapLocked ? (
                <div className="space-y-1">
                  <Label>{t('users.col.status')}</Label>
                  <Input
                    readOnly
                    value={t('users.user_status.active')}
                    className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                  />
                </div>
              ) : (
                <FormField
                  name="status"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('users.col.status')}</FormLabel>
                      {editMode.fieldsEnabled ? (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent dir={i18n.dir()}>
                            {statusOptions.map((s) => (
                              <SelectItem key={s} value={s}>
                                {t(`users.user_status.${s}`, { defaultValue: s })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl>
                          <ReadOnlyCopyableField
                            value={statusDisplayLabel}
                            dir={i18n.dir()}
                          />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                name="branch_id"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    {editMode.fieldsEnabled ? (
                      <BranchCombobox
                        label={t('users.col.branch')}
                        value={field.value}
                        onChange={(b) => field.onChange(b)}
                        allowClear
                      />
                    ) : (
                      <>
                        <FormLabel>{t('users.col.branch')}</FormLabel>
                        <FormControl>
                          <ReadOnlyCopyableField
                            value={branchDisplayLabel}
                            dir={i18n.dir()}
                          />
                        </FormControl>
                      </>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {/* Roles Section */}
            <div className="border-border space-y-3 border-t pt-5">
              <div>
                <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                  {t('users.roles_section')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {userRoles.length ? (
                    userRoles.map((r) => (
                      <Badge
                        key={`${r.role_id}-${r.branch_id ?? 'all'}`}
                        variant="outline"
                        className="h-auto max-w-full gap-1.5 border-primary/30 bg-white py-1.5 pe-1 ps-2 font-normal text-primary hover:bg-primary/5"
                      >
                        <span className="min-w-0 truncate">{roleCodeLabel(t, r.role_code, r.role_name)}</span>
                        {!i18n.language.startsWith('ar') ? (
                          <span dir="ltr" className="text-muted-foreground shrink-0 font-mono text-[10px]">
                            {r.role_code}
                          </span>
                        ) : null}
                        {editMode.fieldsEnabled &&
                        canUpdate &&
                        !(bootstrapLocked && String(r.role_code).toUpperCase() === 'ADMIN') ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive h-6 shrink-0 px-1.5 text-xs"
                            onClick={() => {
                              const body: UserRoleAssign = {
                                role_id: r.role_id,
                                branch_id: r.branch_id,
                              };
                              void removeRole
                                .mutateAsync(body)
                                .then(() => refetchRoles())
                                .then(() => notify.success(tc('toasts.removed')))
                                .catch((error) => notifyApiError(error, tc('errors.generic')));
                            }}
                          >
                            {t('actions.remove')}
                          </Button>
                        ) : null}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </div>
              </div>

              {editMode.fieldsEnabled && canUpdate && !bootstrapLocked && isDeactivated ? (
                <p className="text-muted-foreground text-sm">{t('users.roles_disabled_deactivated')}</p>
              ) : null}
              {editMode.fieldsEnabled && canUpdate && !bootstrapLocked && !isDeactivated ? (
                <div className="bg-muted/30 flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-sm">{t('users.add_role')}</Label>
                    <RoleIdCombobox value={addRoleId} onChange={setAddRoleId} />
                  </div>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!addRoleId) return;
                      try {
                        await addRole.mutateAsync({ role_id: Number(addRoleId), branch_id: null });
                        setAddRoleId('');
                        await refetchRoles();
                        notify.success(tc('toasts.saved'));
                      } catch (error) {
                        notifyApiError(error, tc('errors.generic'));
                      }
                    }}
                  >
                    {t('actions.add')}
                  </Button>
                </div>
              ) : null}
            </div>

            <FormValidationAlert message={formError} />
            </fieldset>
          </form>
        </Form>

        {!editMode.isEditing && canUpdate && !bootstrapLocked ? (
          <div className="flex flex-wrap gap-2 border-t pt-5">
            <Button
              type="button"
              variant="outline"
              disabled={requestReset.isPending}
              onClick={() =>
                void requestReset
                  .mutateAsync(userId)
                  .then(() => notify.success(tc('toasts.email_sent')))
                  .catch((error) => notifyApiError(error, tc('errors.generic')))
              }
            >
              {t('users.reset_password')}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to={`/admin/users/${userId}/permissions`}>{t('users.view_permissions')}</Link>
            </Button>
          </div>
        ) : null}
      </section>

      <DangerConfirmDialog
        open={statusDialogOpen && !bootstrapLocked && !isSelf}
        onOpenChange={(open) => {
          if (!bootstrapLocked && !isSelf) setStatusDialogOpen(open);
        }}
        title={
          statusAction === 'activate' ? t('users.activate_title') : t('users.deactivate_title')
        }
        description={
          statusAction === 'activate' ? t('users.activate_desc') : t('users.deactivate_desc')
        }
        confirmKeyword={
          statusAction === 'activate'
            ? t('users.activate_confirm_keyword')
            : t('users.deactivate_confirm_keyword')
        }
        isLoading={update.isPending}
        onConfirm={async () => {
          try {
            await update.mutateAsync({
              status: statusAction === 'activate' ? 'active' : 'deactivated',
            });
            notify.success(
              statusAction === 'activate' ? tc('toasts.activated') : tc('toasts.deactivated'),
            );
            setStatusDialogOpen(false);
          } catch (error) {
            notifyApiError(error, tc('errors.generic'));
          }
        }}
      />
    </div>
  );
}

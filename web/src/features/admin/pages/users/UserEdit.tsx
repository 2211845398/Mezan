import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';

import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
  floatingFormDangerButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { usePermission } from '@/hooks/usePermission';
import RouteLoader from '@/routes/RouteLoader';

import { BranchPicker } from '../../components/BranchPicker';
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
} from '../../queries';
import type { UserRoleAssign } from '../../types';

const schema = z.object({
  full_name: z.string().min(1).optional().nullable(),
  status: z.string(),
  branch_id: z.coerce.number().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

const statusOptions = ['active', 'deactivated', 'suspended', 'banned', 'pending_onboarding'] as const;

export default function UserEdit() {
  const { t, i18n } = useTranslation('admin');
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
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [addRoleId, setAddRoleId] = useState<string>('');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!user) return;
    form.reset({
      full_name: user.full_name,
      status: user.status,
      branch_id: user.branch_id,
    });
  }, [user, form]);

  if (!Number.isFinite(userId) || isError) {
    return <p className="p-4 text-destructive">{t('users.not_found')}</p>;
  }
  if (isLoading || !user) {
    return <RouteLoader />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('users.edit_title')}</h1>
        <Button variant="outline" className={floatingFormCloseButtonClassName} asChild>
          <Link to="/admin/users">{t('actions.back')}</Link>
        </Button>
      </div>

      <section className="bg-card space-y-5 rounded-2xl border p-4 shadow-sm md:p-6">
        <h2 className="text-lg font-semibold">{t('users.edit_form_section')}</h2>

        <Form {...form}>
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((v) =>
              update.mutateAsync({
                full_name: v.full_name == null ? null : v.full_name,
                status: v.status,
                branch_id: v.branch_id == null ? null : v.branch_id,
              }),
            )}
          >
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
                name="full_name"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.col.full_name')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} disabled={!canUpdate} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                name="status"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.col.status')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!canUpdate}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                name="branch_id"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <BranchPicker
                      label={t('users.col.branch')}
                      value={field.value}
                      onChange={(b) => field.onChange(b)}
                      allowClear
                      disabled={!canUpdate}
                    />
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
                        {canUpdate ? (
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
                              void removeRole.mutateAsync(body).then(() => refetchRoles());
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

              {canUpdate ? (
                <div className="bg-muted/30 flex flex-col gap-3 rounded-xl border border-dashed p-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-sm">{t('users.add_role')}</Label>
                    <RoleIdCombobox value={addRoleId} onChange={setAddRoleId} />
                  </div>
                  <Button
                    type="button"
                    className={floatingFormApproveButtonClassName}
                    onClick={async () => {
                      if (!addRoleId) return;
                      await addRole.mutateAsync({ role_id: Number(addRoleId), branch_id: null });
                      setAddRoleId('');
                      await refetchRoles();
                    }}
                  >
                    {t('actions.add')}
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Action Buttons with separators */}
            {canUpdate ? (
              <div className="border-border flex flex-wrap items-center gap-2 border-t pt-5">
                <Button type="submit" className={floatingFormApproveButtonClassName} disabled={update.isPending}>
                  {t('actions.save')}
                </Button>
                <Separator orientation="vertical" className="h-8" />
                <Button
                  type="button"
                  variant="outline"
                  className={floatingFormCloseButtonClassName}
                  onClick={() => void requestReset.mutateAsync(userId)}
                >
                  {t('users.reset_password')}
                </Button>
                <Separator orientation="vertical" className="h-8" />
                <Button type="button" variant="outline" className={floatingFormCloseButtonClassName} asChild>
                  <Link to={`/admin/users/${userId}/permissions`}>{t('users.view_permissions')}</Link>
                </Button>
                <Separator orientation="vertical" className="h-8" />
                <Button
                  type="button"
                  className={floatingFormDangerButtonClassName}
                  onClick={() => setDeactivateOpen(true)}
                >
                  {t('users.deactivate')}
                </Button>
              </div>
            ) : null}
          </form>
        </Form>
      </section>

      <DangerConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={t('users.deactivate_title')}
        description={t('users.deactivate_desc')}
        confirmKeyword="DELETE"
        isLoading={update.isPending}
        onConfirm={async () => {
          await update.mutateAsync({ status: 'deactivated' });
          setDeactivateOpen(false);
        }}
      />
    </div>
  );
}

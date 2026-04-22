import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';
import RouteLoader from '@/routes/RouteLoader';

import { BranchPicker } from '../../components/BranchPicker';
import { DangerConfirmDialog } from '../../components/DangerConfirmDialog';
import {
  useAddUserRole,
  useRemoveUserRole,
  useRequestPasswordReset,
  useRoles,
  useUpdateUser,
  useUser,
  useUserRoles,
} from '../../queries';
import type { UserRoleAssign } from '../../types';
import { PermissionOverridesDrawer } from './PermissionOverridesDrawer';

const schema = z.object({
  full_name: z.string().min(1).optional().nullable(),
  status: z.string(),
  branch_id: z.coerce.number().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

const statusOptions = ['active', 'deactivated', 'suspended', 'banned', 'pending_onboarding'] as const;

export default function UserEdit() {
  const { t } = useTranslation('admin');
  const { id } = useParams();
  const userId = Number(id);
  const { data: user, isLoading, isError } = useUser(userId, { enabled: Number.isFinite(userId) });
  const { data: userRoles = [], refetch: refetchRoles } = useUserRoles(userId, {
    enabled: Number.isFinite(userId),
  });
  const { data: allRoles = [] } = useRoles();
  const update = useUpdateUser(userId);
  const addRole = useAddUserRole(userId);
  const removeRole = useRemoveUserRole(userId);
  const requestReset = useRequestPasswordReset();
  const canUpdate = usePermission('users', 'update');
  const [permOpen, setPermOpen] = useState(false);
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

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#permissions') {
      setPermOpen(true);
    }
  }, [userId]);

  if (!Number.isFinite(userId) || isError) {
    return <p className="p-4 text-destructive">{t('users.not_found')}</p>;
  }
  if (isLoading || !user) {
    return <RouteLoader />;
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('users.edit_title')}</h1>
        <Button variant="secondary" asChild>
          <Link to="/admin/users">{t('actions.back')}</Link>
        </Button>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        {user.email} (id: {user.id})
      </p>
      {canUpdate ? (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) =>
              update.mutateAsync({
                full_name: v.full_name == null ? null : v.full_name,
                status: v.status,
                branch_id: v.branch_id == null ? null : v.branch_id,
              }),
            )}
            className="space-y-4"
          >
            <FormField
              name="full_name"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.col.full_name')}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
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
                  <Select onValueChange={field.onChange} value={field.value}>
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
                <FormItem>
                  <BranchPicker
                    label={t('users.col.branch')}
                    value={field.value}
                    onChange={(b) => field.onChange(b)}
                    allowClear
                  />
                </FormItem>
              )}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={update.isPending}>
                {t('actions.save')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void requestReset.mutateAsync(userId)}
              >
                {t('users.reset_password')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPermOpen(true)}>
                {t('users.view_permissions')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeactivateOpen(true)}
              >
                {t('users.deactivate')}
              </Button>
            </div>
          </form>
        </Form>
      ) : null}
      <div className="mt-6 space-y-2">
        <h2 className="text-lg font-medium">{t('users.roles_section')}</h2>
        <ul className="list-inside list-disc text-sm">
          {userRoles.map((r) => (
            <li key={`${r.role_id}-${r.branch_id ?? 'all'}`} className="flex items-center gap-2">
              {r.role_code} ({r.role_name})
              {canUpdate ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
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
            </li>
          ))}
        </ul>
        {canUpdate ? (
          <div className="flex max-w-md items-end gap-2">
            <div className="flex-1">
              <p className="mb-1 text-sm font-medium">{t('users.add_role')}</p>
              <Select value={addRoleId} onValueChange={setAddRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('users.pick_role')} />
                </SelectTrigger>
                <SelectContent>
                  {allRoles.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.code ?? r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
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
      <PermissionOverridesDrawer userId={userId} open={permOpen} onOpenChange={setPermOpen} />
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';

import { getUserRoles, updateUser as apiUpdateUser } from '../../api';
import { BranchPicker } from '../../components/BranchPicker';
import { DangerConfirmDialog } from '../../components/DangerConfirmDialog';
import { getBranchLabel } from '../../lib/branchLabels';
import { adminKeys, useBranches, useCreateUser, useRequestPasswordReset, useUsersList } from '../../queries';
import type { UserRead, UserRoleRow } from '../../types';

const statusOptions = ['active', 'deactivated', 'suspended', 'banned', 'pending_onboarding'] as const;

function UserFloatingForm({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRead | null;
}) {
  const { t } = useTranslation('admin');
  const qc = useQueryClient();
  const isEdit = user != null;
  const create = useCreateUser();
  const update = useMutation({
    mutationFn: async (body: Parameters<typeof apiUpdateUser>[1]) => {
      if (!user) throw new Error('missing user');
      return apiUpdateUser(user.id, body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.userList() });
      onOpenChange(false);
    },
  });
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [roleCode, setRoleCode] = useState('');
  const [requireOnboarding, setRequireOnboarding] = useState(true);
  const [assignedHrUserId, setAssignedHrUserId] = useState('');
  const [status, setStatus] = useState<string>('active');

  useEffect(() => {
    if (!open) return;
    setEmail(user?.email ?? '');
    setFullName(user?.full_name ?? '');
    setPassword('');
    setBranchId(user?.branch_id ?? null);
    setRoleCode('');
    setRequireOnboarding(!user);
    setAssignedHrUserId('');
    setStatus(user?.status ?? 'active');
  }, [open, user]);

  async function submit() {
    if (isEdit) {
      await update.mutateAsync({
        full_name: fullName.trim() || null,
        status,
        branch_id: branchId,
      });
      return;
    }
    await create.mutateAsync({
      email: email.trim(),
      full_name: fullName.trim(),
      password: password.trim() || null,
      branch_id: branchId,
      role_code: roleCode.trim() || null,
      require_onboarding: requireOnboarding,
      assigned_hr_user_id: assignedHrUserId.trim() ? Number(assignedHrUserId) : null,
      status: requireOnboarding ? 'pending_onboarding' : 'active',
    });
    onOpenChange(false);
  }

  const busy = create.isPending || update.isPending;

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t('users.edit_title') : t('users.create_title')}
      maxWidth="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {!isEdit ? (
          <div className="space-y-1">
            <Label>{t('users.col.email')}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        ) : null}
        <div className="space-y-1">
          <Label>{t('users.col.full_name')}</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        {!isEdit ? (
          <div className="space-y-1">
            <Label>{t('users.password')}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        ) : null}
        <BranchPicker label={t('users.col.branch')} value={branchId} onChange={setBranchId} allowClear />
        {!isEdit ? (
          <>
            <div className="space-y-1">
              <Label>{t('users.role_code')}</Label>
              <Input
                placeholder="IT_ADMIN, CASHIER"
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={requireOnboarding} onCheckedChange={setRequireOnboarding} id="quick-onb" />
              <Label htmlFor="quick-onb">{t('users.require_onboarding')}</Label>
            </div>
            {requireOnboarding ? (
              <div className="space-y-1">
                <Label>{t('users.assigned_hr_id')}</Label>
                <Input
                  type="number"
                  value={assignedHrUserId}
                  onChange={(e) => setAssignedHrUserId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('users.assigned_hr_help')}</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-1">
            <Label>{t('users.col.status')}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={busy || (!isEdit && (!email.trim() || !fullName.trim()))}>
            {t('actions.save')}
          </Button>
        </div>
      </form>
    </FloatingFormDialog>
  );
}

export default function UsersList() {
  const { t } = useTranslation('admin');
  const { data: users = [], isLoading, isError, refetch } = useUsersList();
  const { data: branches = [] } = useBranches(false);
  const { data: roleMap } = useQuery({
    queryKey: adminKeys.userRoleSummary(
      [...users]
        .map((u) => u.id)
        .sort((a, b) => a - b),
    ),
    queryFn: async () => {
      const entries: [number, string][] = [];
      for (const u of users) {
        const roles: UserRoleRow[] = await getUserRoles(u.id);
        const text = roles.map((r) => r.role_code).join(', ') || '—';
        entries.push([u.id, text]);
      }
      return new Map(entries);
    },
    enabled: users.length > 0,
  });
  const canUpdate = usePermission('users', 'update');
  const canCreate = usePermission('users', 'create');
  const [deactivateUser, setDeactivateUser] = useState<UserRead | null>(null);
  const [formUser, setFormUser] = useState<UserRead | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const qc = useQueryClient();
  const setUserStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => apiUpdateUser(id, { status }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.userList() });
    },
  });
  const requestReset = useRequestPasswordReset();

  const columns = useMemo(
    () =>
      defineColumns<UserRead>()([
        {
          id: 'email',
          accessorKey: 'email',
          header: t('users.col.email'),
        },
        {
          id: 'full_name',
          accessorKey: 'full_name',
          header: t('users.col.full_name'),
          cell: ({ row }) => row.original.full_name ?? '—',
        },
        {
          id: 'status',
          accessorKey: 'status',
          header: t('users.col.status'),
        },
        {
          id: 'branch',
          header: t('users.col.branch'),
          cell: ({ row }) => getBranchLabel(branches, row.original.branch_id ?? null),
        },
        {
          id: 'role',
          header: t('users.col.role'),
          cell: ({ row }) => roleMap?.get(row.original.id) ?? '…',
        },
        {
          id: 'last_login',
          accessorKey: 'last_login_at',
          header: t('users.col.last_login'),
          cell: ({ row }) =>
            row.original.last_login_at ? formatIso(row.original.last_login_at, 'yyyy-MM-dd HH:mm') : '—',
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => {
            const u = row.original;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" aria-label={t('actions.open_menu')}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setFormUser(u);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="me-2 size-4" />
                      {t('actions.edit')}
                    </DropdownMenuItem>
                  ) : null}
                  {canUpdate ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setDeactivateUser(u);
                      }}
                    >
                      {t('users.deactivate')}
                    </DropdownMenuItem>
                  ) : null}
                  {canUpdate ? (
                    <DropdownMenuItem
                      onClick={() => void requestReset.mutateAsync(u.id)}
                    >
                      {t('users.reset_password')}
                    </DropdownMenuItem>
                  ) : null}
                  {canUpdate ? (
                    <DropdownMenuItem asChild>
                      <Link to={`/admin/users/${u.id}#permissions`}>
                        {t('users.view_permissions')}
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        },
      ]),
    [t, branches, roleMap, canUpdate, requestReset],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('users.title')}
        actions={
          canCreate ? (
            <Button
              type="button"
              onClick={() => {
                setFormUser(null);
                setFormOpen(true);
              }}
            >
              <Plus className="me-2 size-4" />
              {t('users.create')}
            </Button>
          ) : null
        }
      />
      <DataTable
        mode="client"
        columns={columns}
        data={users}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-sm text-muted-foreground">{t('users.empty')}</p>}
      />
      <DangerConfirmDialog
        open={!!deactivateUser}
        onOpenChange={(o) => !o && setDeactivateUser(null)}
        title={t('users.deactivate_title')}
        description={t('users.deactivate_desc')}
        confirmKeyword="DELETE"
        isLoading={setUserStatus.isPending}
        onConfirm={async () => {
          if (!deactivateUser) return;
          await setUserStatus.mutateAsync({ id: deactivateUser.id, status: 'deactivated' });
          setDeactivateUser(null);
        }}
      />
      <UserFloatingForm open={formOpen} onOpenChange={setFormOpen} user={formUser} />
    </div>
  );
}

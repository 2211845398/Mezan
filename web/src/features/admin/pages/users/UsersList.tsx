import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';

import { getUserRoles, updateUser as apiUpdateUser } from '../../api';
import { BranchPicker } from '../../components/BranchPicker';
import { DangerConfirmDialog } from '../../components/DangerConfirmDialog';
import { HrAssigneeCombobox } from '../../components/HrAssigneeCombobox';
import { RoleCodeCombobox } from '../../components/RoleCodeCombobox';
import { getBranchLabel } from '../../lib/branchLabels';
import { adminKeys, useBranches, useCreateUser, useRequestPasswordReset, useUsersList } from '../../queries';
import type { UserRead, UserRoleRow } from '../../types';

export default function UsersList() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
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
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();

  // Create user form state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [roleCode, setRoleCode] = useState('');
  const [requireOnboarding, setRequireOnboarding] = useState(true);
  const [assignedHrUserId, setAssignedHrUserId] = useState('');

  const setUserStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => apiUpdateUser(id, { status }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.userList() });
    },
  });

  const createUser = useCreateUser();
  const requestReset = useRequestPasswordReset();

  const handleCreateSubmit = async () => {
    await createUser.mutateAsync({
      email: email.trim(),
      full_name: fullName.trim(),
      password: password.trim() || null,
      branch_id: branchId,
      role_code: roleCode.trim() || null,
      require_onboarding: requireOnboarding,
      assigned_hr_user_id: assignedHrUserId.trim() ? Number(assignedHrUserId) : null,
      status: requireOnboarding ? 'pending_onboarding' : 'active',
    });
    setCreateOpen(false);
    // Reset form
    setEmail('');
    setFullName('');
    setPassword('');
    setBranchId(null);
    setRoleCode('');
    setRequireOnboarding(true);
    setAssignedHrUserId('');
  };

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
                      className="cursor-pointer"
                      onSelect={() => {
                        navigate(`/admin/users/${u.id}`);
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
                    <DropdownMenuItem onClick={() => void requestReset.mutateAsync(u.id)}>
                      {t('users.reset_password')}
                    </DropdownMenuItem>
                  ) : null}
                  {canUpdate ? (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => navigate(`/admin/users/${u.id}/permissions`)}
                    >
                      {t('users.view_permissions')}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        },
      ]),
    [t, branches, roleMap, canUpdate, requestReset, navigate],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('users.title')}
        actions={
          canCreate ? (
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="gap-2"
            >
              <Plus className="size-4" />
              {t('users.create')}
            </Button>
          ) : null
        }
      />

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent motionless className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('users.create_title')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('users.create_dialog_a11y')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>{t('users.col.full_name')}</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('users.password')}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('users.password')}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('users.col.email')}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <BranchPicker
              label={t('users.col.branch')}
              value={branchId}
              onChange={setBranchId}
              allowClear
            />
            <div className="space-y-1">
              <Label>{t('users.role_code')}</Label>
              <RoleCodeCombobox
                value={roleCode}
                onChange={setRoleCode}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('users.assigned_hr_id')}</Label>
              <HrAssigneeCombobox
                value={assignedHrUserId}
                onChange={setAssignedHrUserId}
              />
              <p className="text-xs text-muted-foreground">{t('users.assigned_hr_help')}</p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                className={floatingFormCloseButtonClassName}
                onClick={() => setCreateOpen(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="button"
                className={floatingFormApproveButtonClassName}
                onClick={() => void handleCreateSubmit()}
                disabled={!email.trim() || !fullName.trim() || createUser.isPending}
              >
                {t('actions.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}

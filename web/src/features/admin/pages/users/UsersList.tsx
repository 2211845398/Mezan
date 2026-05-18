import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { getLocalizedApiErrorMessage, notifyApiError } from '@/api/errorMessages';
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
import { formatPersonName } from '@/lib/personName';
import { notify } from '@/lib/toast';

import { getUserRoles, updateUser as apiUpdateUser } from '../../api';
import { BranchPicker } from '../../components/BranchPicker';
import { DangerConfirmDialog } from '../../components/DangerConfirmDialog';
import { HrAssigneeCombobox } from '../../components/HrAssigneeCombobox';
import { RoleCodeCombobox } from '../../components/RoleCodeCombobox';
import { getBranchLabel } from '../../lib/branchLabels';
import { roleCodeLabel } from '../../lib/roleLabels';
import {
  userRowBranchFilterValue,
  userRowNameFilterValue,
  userRowRoleFilterValue,
  userRowStatusFilterValue,
} from '../../lib/userListSearch';
import { adminKeys, useBranches, useCreateUser, useRequestPasswordReset, useUsersList } from '../../queries';
import type { UserRead, UserRoleRow } from '../../types';

export default function UsersList() {
  const { t, i18n } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
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
  const [firstName, setFirstName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [roleCode, setRoleCode] = useState('');
  const [assignedHrUserId, setAssignedHrUserId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const setUserStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => apiUpdateUser(id, { status }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.userList() });
    },
  });

  const createUser = useCreateUser();
  const requestReset = useRequestPasswordReset();

  const handleCreateSubmit = async () => {
    setCreateError(null);
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setCreateError(t('users.email_invalid'));
      return;
    }
    if (trimmedPassword && trimmedPassword.length < 8) {
      setCreateError(t('users.password_too_short'));
      return;
    }

    try {
      await createUser.mutateAsync({
        email: trimmedEmail,
        first_name: firstName.trim() || null,
        father_name: fatherName.trim() || null,
        family_name: familyName.trim() || null,
        password: trimmedPassword || null,
        branch_id: branchId,
        role_code: roleCode.trim() || null,
        assigned_hr_user_id: assignedHrUserId.trim() ? Number(assignedHrUserId) : null,
        status: 'pending_onboarding',
      });
      notify.success(tc('toasts.saved'));
      setCreateOpen(false);
      // Reset form
      setFirstName('');
      setFatherName('');
      setFamilyName('');
      setEmail('');
      setPassword('');
      setBranchId(null);
      setRoleCode('');
      setAssignedHrUserId('');
    } catch (error) {
      setCreateError(getLocalizedApiErrorMessage(error, tc, tc('errors.generic')));
    }
  };

  const columns = useMemo(() => {
    const tAr = i18n.getFixedT('ar', 'admin');
    const tEn = i18n.getFixedT('en', 'admin');

    return defineColumns<UserRead>()([
        {
          id: 'email',
          accessorKey: 'email',
          header: t('users.col.email'),
        },
        {
          id: 'display_name',
          accessorFn: (row) => userRowNameFilterValue(row),
          header: t('users.col.full_name'),
          cell: ({ row }) =>
            formatPersonName(row.original.first_name, row.original.father_name, row.original.family_name) || '—',
        },
        {
          id: 'status',
          accessorFn: (row) => userRowStatusFilterValue(row, tAr, tEn),
          header: t('users.col.status'),
          cell: ({ row }) =>
            t(`users.user_status.${row.original.status}`, { defaultValue: row.original.status }),
        },
        {
          id: 'branch',
          accessorFn: (row) => userRowBranchFilterValue(row, branches),
          header: t('users.col.branch'),
          cell: ({ row }) => getBranchLabel(branches, row.original.branch_id ?? null),
        },
        {
          id: 'role',
          accessorFn: (row) => userRowRoleFilterValue(row.id, roleMap, tAr, tEn),
          header: t('users.col.role'),
          cell: ({ row }) => {
            const raw = roleMap?.get(row.original.id);
            if (!raw || raw === '…') return raw ?? '…';
            return raw
              .split(', ')
              .map((code) => roleCodeLabel(t, code.trim(), code.trim()))
              .join(', ');
          },
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
          enableGlobalFilter: false,
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
                      {t('actions.edit')}
                    </DropdownMenuItem>
                  ) : null}
                  {canUpdate && !u.bootstrap_admin_protected ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setDeactivateUser(u);
                      }}
                    >
                      {t('users.deactivate')}
                    </DropdownMenuItem>
                  ) : null}
                  {canUpdate && !u.bootstrap_admin_protected ? (
                    <DropdownMenuItem
                      onClick={() =>
                        void requestReset
                          .mutateAsync(u.id)
                          .then(() => notify.success(tc('toasts.email_sent')))
                          .catch((error) => notifyApiError(error, t('errors.generic', { ns: 'common' })))
                      }
                    >
                      {t('users.reset_password')}
                    </DropdownMenuItem>
                  ) : null}
                  {canUpdate && !u.bootstrap_admin_protected ? (
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
      ]);
  }, [t, i18n, branches, roleMap, canUpdate, requestReset, navigate, tc]);

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
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
      >
        <DialogContent motionless className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('users.create_title')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('users.create_dialog_a11y')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>{t('users.col.first_name')}</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('users.col.father_name')}</Label>
              <Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('users.col.family_name')}</Label>
              <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
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
            <div className="space-y-1">
              <Label>{t('users.password')}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('users.password')}
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
            </div>
            {createError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </p>
            ) : null}
            <div className="flex justify-end gap-[5px] pt-4">
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
                disabled={!email.trim() || !firstName.trim() || createUser.isPending}
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
          try {
            await setUserStatus.mutateAsync({ id: deactivateUser.id, status: 'deactivated' });
            notify.success(tc('toasts.deactivated'));
            setDeactivateUser(null);
          } catch (error) {
            notifyApiError(error, t('errors.generic', { ns: 'common' }));
          }
        }}
      />
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { paginatedParams } from '@/api/pagination';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { getLocalizedApiErrorMessage, notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  FloatingFormDialog,
  FloatingFormDialogFooter,
} from '@/components/shared/FloatingFormDialog';
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
import { useAuthStore } from '@/features/auth/stores/authStore';
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

const USER_CREATE_FORM_ID = 'admin-user-create-form';

type UserStatusAction = {
  user: UserRead;
  action: 'deactivate' | 'activate';
};

export default function UsersList() {
  const { t, i18n } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [urlQuery] = useTableUrlState({ pageSize: 20 });
  const { limit, offset } = paginatedParams(urlQuery.page, urlQuery.pageSize);
  const { data, isLoading, isError, refetch } = useUsersList({ limit, offset });
  const users = data?.items ?? [];
  const totalRows = data?.total ?? 0;
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
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [statusAction, setStatusAction] = useState<UserStatusAction | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();

  // Create user form state
  const [firstName, setFirstName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [email, setEmail] = useState('');
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setCreateError(t('users.email_invalid'));
      return;
    }

    try {
      await createUser.mutateAsync({
        email: trimmedEmail,
        first_name: firstName.trim() || null,
        father_name: fatherName.trim() || null,
        family_name: familyName.trim() || null,
        branch_id: branchId,
        role_code: roleCode.trim() || null,
        assigned_hr_user_id: assignedHrUserId.trim() ? Number(assignedHrUserId) : null,
        status: 'suspended',
      });
      notify.success(tc('toasts.saved'));
      setCreateOpen(false);
      // Reset form
      setFirstName('');
      setFatherName('');
      setFamilyName('');
      setEmail('');
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
                  {canUpdate &&
                  !u.bootstrap_admin_protected &&
                  u.id !== currentUserId ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setStatusAction({
                          user: u,
                          action: u.status === 'deactivated' ? 'activate' : 'deactivate',
                        });
                      }}
                    >
                      {u.status === 'deactivated' ? t('users.activate') : t('users.deactivate')}
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
  }, [t, i18n, branches, roleMap, canUpdate, requestReset, navigate, tc, currentUserId]);

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

      <FloatingFormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
        title={t('users.create_title')}
        maxWidth="lg"
        footer={
          <FloatingFormDialogFooter
            formId={USER_CREATE_FORM_ID}
            onCancel={() => setCreateOpen(false)}
            saveLabel={t('actions.save')}
            cancelLabel={t('actions.cancel')}
            isSubmitting={createUser.isPending}
            saveDisabled={!email.trim() || !firstName.trim()}
          />
        }
      >
        <form
          id={USER_CREATE_FORM_ID}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateSubmit();
          }}
        >
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
          <BranchPicker
            label={t('users.col.branch')}
            value={branchId}
            onChange={setBranchId}
            allowClear
          />
          <div className="space-y-1">
            <Label>{t('users.role_code')}</Label>
            <RoleCodeCombobox value={roleCode} onChange={setRoleCode} />
          </div>
          <div className="space-y-1">
            <Label>{t('users.assigned_hr_id')}</Label>
            <HrAssigneeCombobox value={assignedHrUserId} onChange={setAssignedHrUserId} />
          </div>
          {createError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {createError}
            </p>
          ) : null}
        </form>
      </FloatingFormDialog>

      <DataTable
        mode="server"
        columns={columns}
        data={users}
        totalRows={totalRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-sm text-muted-foreground">{t('users.empty')}</p>}
      />
      <DangerConfirmDialog
        open={!!statusAction}
        onOpenChange={(o) => !o && setStatusAction(null)}
        title={
          statusAction?.action === 'activate'
            ? t('users.activate_title')
            : t('users.deactivate_title')
        }
        description={
          statusAction?.action === 'activate'
            ? t('users.activate_desc')
            : t('users.deactivate_desc')
        }
        confirmKeyword={
          statusAction?.action === 'activate'
            ? t('users.activate_confirm_keyword')
            : t('users.deactivate_confirm_keyword')
        }
        isLoading={setUserStatus.isPending}
        onConfirm={async () => {
          if (!statusAction) return;
          const nextStatus = statusAction.action === 'activate' ? 'active' : 'deactivated';
          try {
            await setUserStatus.mutateAsync({ id: statusAction.user.id, status: nextStatus });
            notify.success(
              statusAction.action === 'activate' ? tc('toasts.activated') : tc('toasts.deactivated'),
            );
            setStatusAction(null);
          } catch (error) {
            notifyApiError(error, t('errors.generic', { ns: 'common' }));
          }
        }}
      />
    </div>
  );
}

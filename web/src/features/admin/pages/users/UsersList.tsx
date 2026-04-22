import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';

import { getUserRoles, updateUser as apiUpdateUser } from '../../api';
import { DangerConfirmDialog } from '../../components/DangerConfirmDialog';
import { getBranchLabel } from '../../lib/branchLabels';
import { adminKeys, useBranches, useRequestPasswordReset, useUsersList } from '../../queries';
import type { UserRead, UserRoleRow } from '../../types';

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
                    <DropdownMenuItem asChild>
                      <Link to={`/admin/users/${u.id}`}>{t('actions.edit')}</Link>
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
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('users.title')}</h1>
        {canCreate ? (
          <Button asChild>
            <Link to="/admin/users/new">{t('users.create')}</Link>
          </Button>
        ) : null}
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={users}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t('users.empty')}</p>}
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

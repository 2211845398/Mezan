import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
  floatingFormCloseButtonSmClassName,
  FloatingFormDialog,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import { setRolePermissions } from '../../api';
import { PermissionGrid } from '../../components/PermissionGrid';
import { roleCodeLabel } from '../../lib/roleLabels';
import { adminKeys, usePermissions, useRoles } from '../../queries';
import type { RoleWithPermissions } from '../../types';

export default function RolesList() {
  const { t } = useTranslation('admin');
  const qc = useQueryClient();
  const { data: roles = [], isLoading, isError, refetch } = useRoles();
  const { data: perms = [] } = usePermissions();
  const canUpdate = usePermission('roles', 'update');
  const [permDialogRole, setPermDialogRole] = useState<RoleWithPermissions | null>(null);
  const [permDialogIds, setPermDialogIds] = useState<number[]>([]);

  useEffect(() => {
    if (!permDialogRole) return;
    setPermDialogIds([...permDialogRole.permission_ids]);
  }, [permDialogRole]);

  const savePerms = useMutation({
    mutationFn: ({ roleId, permission_ids }: { roleId: number; permission_ids: number[] }) =>
      setRolePermissions(roleId, { permission_ids }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.roleList() });
      setPermDialogRole(null);
    },
  });

  const dialogReadOnly = !permDialogRole || permDialogRole.is_system || !canUpdate;

  const columns = useMemo(
    () =>
      defineColumns<RoleWithPermissions>()([
        {
          id: 'name',
          accessorKey: 'name',
          header: t('roles.col.name'),
          cell: ({ row }) => {
            const code = row.original.code ?? '';
            const display = code ? roleCodeLabel(t, code, row.original.name) : row.original.name;
            return <span className="font-medium">{display}</span>;
          },
        },
        { id: 'code', accessorKey: 'code', header: t('roles.col.code') },
        {
          id: 'is_system',
          accessorKey: 'is_system',
          header: t('roles.col.is_system'),
          cell: ({ row }) => (row.original.is_system ? t('yes') : t('no')),
        },
        {
          id: 'perms',
          header: t('roles.col.permission_count'),
          cell: ({ row }) => {
            const r = row.original;
            if (!r.code) {
              return <span className="text-muted-foreground text-sm">—</span>;
            }
            return (
              <Button type="button" size="sm" variant="outline" onClick={() => setPermDialogRole(r)}>
                {t('roles.open_permissions')}
              </Button>
            );
          },
        },
        {
          id: 'actions',
          cell: ({ row }) =>
            row.original.code && !row.original.is_system && canUpdate ? (
              <Button asChild size="sm" className={floatingFormCloseButtonSmClassName}>
                <Link to={`/admin/roles/${row.original.code}`}>{t('actions.edit')}</Link>
              </Button>
            ) : row.original.code && row.original.is_system ? (
              <span className="text-muted-foreground text-xs">{t('roles.readonly_system')}</span>
            ) : null,
        },
      ]),
    [t, canUpdate],
  );

  const dialogTitle =
    permDialogRole != null
      ? t('roles.permissions_dialog_title', {
          name: roleCodeLabel(t, permDialogRole.code ?? '', permDialogRole.name),
        })
      : '';

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-semibold">{t('roles.title')}</h1>
      <DataTable
        mode="client"
        showSearch={false}
        columns={columns}
        data={roles}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t('roles.empty')}</p>}
      />

      <FloatingFormDialog
        open={permDialogRole != null}
        onOpenChange={(o) => {
          if (!o) setPermDialogRole(null);
        }}
        title={dialogTitle}
        maxWidth="xl"
        footer={
          permDialogRole ? (
            <div className="flex w-full flex-wrap justify-end gap-2">
              {dialogReadOnly ? (
                <Button
                  type="button"
                  variant="outline"
                  className={floatingFormCloseButtonClassName}
                  onClick={() => setPermDialogRole(null)}
                >
                  {t('actions.close')}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className={floatingFormCloseButtonClassName}
                    onClick={() => setPermDialogRole(null)}
                  >
                    {t('actions.cancel')}
                  </Button>
                  <Button
                    type="button"
                    className={floatingFormApproveButtonClassName}
                    disabled={savePerms.isPending}
                    onClick={() => {
                      if (!permDialogRole) return;
                      void savePerms.mutateAsync({
                        roleId: permDialogRole.id,
                        permission_ids: permDialogIds,
                      });
                    }}
                  >
                    {t('actions.save')}
                  </Button>
                </>
              )}
            </div>
          ) : null
        }
      >
        {permDialogRole ? (
          <PermissionGrid
            permissions={perms}
            selectedIds={permDialogIds}
            onChange={setPermDialogIds}
            readOnly={dialogReadOnly}
            disabled={savePerms.isPending}
            embedInScrollContainer
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

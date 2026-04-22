import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import { usePermissions, useRoles } from '../../queries';
import type { RoleWithPermissions } from '../../types';

export default function RolesList() {
  const { t } = useTranslation('admin');
  const { data: roles = [], isLoading, isError, refetch } = useRoles();
  const { data: perms = [] } = usePermissions();
  const permById = useMemo(
    () => new Map(perms.map((p) => [p.id, `${p.resource}:${p.action}`] as const)),
    [perms],
  );
  const canUpdate = usePermission('roles', 'update');

  const columns = useMemo(
    () =>
      defineColumns<RoleWithPermissions>()([
        { id: 'name', accessorKey: 'name', header: t('roles.col.name') },
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
            const labels = row.original.permission_ids
              .map((id) => permById.get(id) ?? `#${id}`)
              .join(', ');
            return <span className="line-clamp-2 text-xs text-muted-foreground">{labels || '—'}</span>;
          },
        },
        {
          id: 'actions',
          cell: ({ row }) =>
            row.original.code && !row.original.is_system && canUpdate ? (
              <Button asChild size="sm" variant="secondary">
                <Link to={`/admin/roles/${row.original.code}`}>{t('actions.edit')}</Link>
              </Button>
            ) : row.original.code && row.original.is_system ? (
              <span className="text-muted-foreground text-xs">{t('roles.readonly_system')}</span>
            ) : null,
        },
      ]),
    [t, permById, canUpdate],
  );

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-semibold">{t('roles.title')}</h1>
      <DataTable
        mode="client"
        columns={columns}
        data={roles}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t('roles.empty')}</p>}
      />
    </div>
  );
}

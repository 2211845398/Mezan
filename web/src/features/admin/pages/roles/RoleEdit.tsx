import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { notifyApiError } from '@/api/errorMessages';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import RouteLoader from '@/routes/RouteLoader';

import { PermissionGrid } from '../../components/PermissionGrid';
import { usePermissions, useRoles, useSetRolePermissions } from '../../queries';
import type { RoleWithPermissions } from '../../types';

export default function RoleEdit() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { code } = useParams();
  const { data: roles = [], isLoading } = useRoles();
  const { data: perms = [] } = usePermissions();
  const role: RoleWithPermissions | undefined = useMemo(
    () => roles.find((r) => (r.code ?? '') === (code ?? '')),
    [roles, code],
  );
  const canUpdate = usePermission('roles', 'update') && role && !role.is_system;
  const [ids, setIds] = useState<number[]>([]);
  const setPerms = useSetRolePermissions(role?.id ?? 0);

  useEffect(() => {
    if (role) setIds([...role.permission_ids]);
  }, [role]);

  if (isLoading) return <RouteLoader />;
  if (!role) return <p className="p-4">{t('roles.not_found')}</p>;
  if (role.is_system) {
    return (
      <div className="p-4">
        <p>{t('roles.cannot_edit_system')}</p>
        <Button asChild variant="outline" className={floatingFormCloseButtonClassName}>
          <Link to="/admin/roles">{t('actions.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {t('roles.edit_title', { name: role.name })}
        </h1>
        <Button variant="outline" className={floatingFormCloseButtonClassName} asChild>
          <Link to="/admin/roles">{t('actions.back')}</Link>
        </Button>
      </div>
      <PermissionGrid
        permissions={perms}
        selectedIds={ids}
        onChange={setIds}
        readOnly={!canUpdate}
        disabled={setPerms.isPending}
      />
      {canUpdate ? (
        <div className="mt-4">
          <Button
            type="button"
            className={floatingFormApproveButtonClassName}
            onClick={async () => {
              try {
                await setPerms.mutateAsync({ permission_ids: ids });
              } catch (error) {
                notifyApiError(error, tc('errors.generic'));
              }
            }}
            disabled={setPerms.isPending}
          >
            {t('actions.save')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

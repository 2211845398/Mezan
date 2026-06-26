import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { notifyApiError } from '@/api/errorMessages';
import { DetailFormActionBar } from '@/components/shared/DetailFormActionBar';
import { BackButton } from '@/components/shared/PageHeader';
import { floatingFormCloseButtonClassName } from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';
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
  const role: RoleWithPermissions | undefined = roles.find(
    (r) => (r.code ?? '') === (code ?? ''),
  );
  const canUpdate = usePermission('roles', 'update') && role && !role.is_system;
  const [ids, setIds] = useState<number[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const snapshotRef = useRef<number[]>([]);
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

  const startEdit = () => {
    snapshotRef.current = [...ids];
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIds(snapshotRef.current);
    setIsEditing(false);
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {t('roles.edit_title', { name: role.name })}
        </h1>
        <div dir="ltr" className="flex flex-wrap items-center gap-[5px]">
          <BackButton to="/admin/roles" label={t('roles.title')} />
          <DetailFormActionBar
            isEditing={isEditing}
            canEdit={Boolean(canUpdate)}
            isSubmitting={setPerms.isPending}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSave={() =>
              void setPerms
                .mutateAsync({ permission_ids: ids })
                .then(() => {
                  snapshotRef.current = [...ids];
                  setIsEditing(false);
                  notify.success(tc('toasts.saved'));
                })
                .catch((error) => notifyApiError(error, tc('errors.generic')))
            }
          />
        </div>
      </div>
      <PermissionGrid
        permissions={perms}
        selectedIds={ids}
        onChange={setIds}
        readOnly={!isEditing}
        disabled={setPerms.isPending}
      />
    </div>
  );
}

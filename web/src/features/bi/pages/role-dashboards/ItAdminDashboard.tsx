import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getHealth } from '@/api/health';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useBackupStatus,
  useNotificationRuns,
  useNotificationSchedules,
  useRoles,
  useTerminals,
  useUsersList,
} from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';

import { RoleDashboardShell } from './RoleDashboardShell';

export default function ItAdminDashboard() {
  const { t } = useTranslation('bi');
  const canUsers = usePermission('users', 'read');
  const canRoles = usePermission('roles', 'read');
  const canTerminals = usePermission('terminals', 'read');
  const canBackups = usePermission('backups', 'read');
  const canNotif = usePermission('notifications', 'read');

  const health = useQuery({
    queryKey: ['health', 'dashboard'],
    queryFn: getHealth,
    staleTime: 60_000,
  });

  const users = useUsersList({ enabled: canUsers });
  const roles = useRoles({ enabled: canRoles });
  const terminals = useTerminals(undefined, { enabled: canTerminals });
  const backups = useBackupStatus({ enabled: canBackups });
  const schedules = useNotificationSchedules({ enabled: canNotif });
  const runs = useNotificationRuns({ enabled: canNotif });

  const activeUsers = useMemo(() => {
    const list = users.data ?? [];
    return list.filter((u) => u.status === 'active').length;
  }, [users.data]);

  return (
    <RoleDashboardShell title={t('role.it.title')} subtitle={t('role.it.subtitle')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.it.api_health')}</CardTitle>
          </CardHeader>
          <CardContent>
            {health.isLoading ? (
              <p>…</p>
            ) : health.isError ? (
              <p className="text-sm text-destructive">{t('role.load_error')}</p>
            ) : (
              <p className="text-lg font-semibold capitalize num-latin">{health.data?.status ?? '—'}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.it.backups')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!canBackups ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : backups.isLoading ? (
              <p>…</p>
            ) : (
              <p className="text-sm num-latin">
                {backups.data?.finished_at
                  ? t('role.it.backup_last_ok', { at: String(backups.data.finished_at).slice(0, 19) })
                  : backups.data?.started_at
                    ? t('role.it.backup_running')
                    : t('role.it.backup_none')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.it.users')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!canUsers ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : users.isLoading ? (
              <p>…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums num-latin">
                {activeUsers}/{users.data?.length ?? 0}
              </p>
            )}
            <CardDescription className="pt-1">{t('role.it.users_hint')}</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.it.terminals')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!canTerminals ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : terminals.isLoading ? (
              <p>…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums num-latin">{terminals.data?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('role.it.roles')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!canRoles ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : roles.isLoading ? (
              <p>…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums num-latin">{roles.data?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('role.it.notification_jobs')}</CardTitle>
            <CardDescription>{t('role.it.notification_jobs_hint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!canNotif ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <p className="text-sm num-latin">
                {t('role.it.notification_counts', {
                  schedules: schedules.data?.length ?? 0,
                  runs: runs.data?.length ?? 0,
                })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleDashboardShell>
  );
}

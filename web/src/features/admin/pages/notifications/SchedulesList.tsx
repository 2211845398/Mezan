import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermission } from '@/hooks/usePermission';

import { triggerNotificationSchedule } from '../../api';
import { adminKeys, useNotificationSchedules, useToggleScheduleActive } from '../../queries';
import type { NotificationScheduleRead } from '../../types';
import { ScheduleEdit } from './ScheduleEdit';

export default function SchedulesList() {
  const { t } = useTranslation('admin');
  const { data: rows = [], isLoading, refetch } = useNotificationSchedules();
  const canUpdate = usePermission('config', 'update');
  const [editing, setEditing] = useState<NotificationScheduleRead | null | 'new'>(null);
  const toggle = useToggleScheduleActive();
  const qc = useQueryClient();
  const runOnce = useMutation({
    mutationFn: triggerNotificationSchedule,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.notificationRuns() });
    },
  });

  return (
    <div>
      {canUpdate ? (
        <div className="mb-2 flex justify-end">
          <Button
            onClick={() => {
              setEditing('new');
            }}
          >
            {t('notifications.new_schedule')}
          </Button>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>name</TableHead>
            <TableHead>kind</TableHead>
            <TableHead>{t('notifications.interval')}</TableHead>
            <TableHead>{t('notifications.target_role')}</TableHead>
            <TableHead>{t('notifications.col.active')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6}>{t('loading')}</TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.kind}</TableCell>
                <TableCell>{r.interval_minutes}</TableCell>
                <TableCell>{r.target_role_code ?? '—'}</TableCell>
                <TableCell>
                  {canUpdate ? (
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={() => void toggle.mutateAsync(r)}
                    />
                  ) : r.is_active ? (
                    t('yes')
                  ) : (
                    t('no')
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {canUpdate ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(r)}>
                        {t('actions.edit')}
                      </Button>
                    ) : null}
                    {canUpdate ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void runOnce.mutateAsync(r.id)}
                        disabled={runOnce.isPending}
                      >
                        {t('notifications.run_once')}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {editing ? (
        <ScheduleEdit
          row={editing === 'new' ? null : editing}
          open={!!editing}
          onOpenChange={(o) => {
            if (!o) {
              setEditing(null);
              void refetch();
            }
          }}
        />
      ) : null}
    </div>
  );
}

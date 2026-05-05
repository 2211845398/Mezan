import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatIso } from '@/lib/date';

import {
  formatGroupedDeliveryStatus,
  groupSentNotificationDeliveries,
  sentNotificationBatchKey,
} from '../../lib/groupSentNotificationDeliveries';
import { formatNotificationDeliveryTargetGroup } from '../../lib/notificationDeliveryTargetGroup';
import { useNotificationDeliveries, useNotificationRuns } from '../../queries';

export default function NotificationHistory() {
  const { t } = useTranslation('admin');
  const { data: deliveries = [], isLoading: deliveriesLoading } = useNotificationDeliveries();
  const { data: runs = [], isLoading: runsLoading } = useNotificationRuns();

  const grouped = useMemo(() => groupSentNotificationDeliveries(deliveries), [deliveries]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('notifications.history_title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('notifications.history_lead')}</p>
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">{t('notifications.delivery_history')}</h3>
        <div className="max-h-96 overflow-auto overscroll-contain rounded-md border [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('notifications.message_title')}</TableHead>
              <TableHead>{t('notifications.col.target_group')}</TableHead>
              <TableHead>{t('notifications.status')}</TableHead>
              <TableHead>{t('notifications.created_at')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveriesLoading ? (
              <TableRow>
                <TableCell colSpan={4}>{t('loading')}</TableCell>
              </TableRow>
            ) : grouped.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  {t('notifications.history_empty')}
                </TableCell>
              </TableRow>
            ) : (
              grouped.map((g) => {
                const row = g.representative;
                return (
                  <TableRow key={sentNotificationBatchKey(row)}>
                    <TableCell>
                      <div className="max-w-md min-w-0">
                        <p className="break-words font-medium">{row.title}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                          {row.body}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs text-sm">
                      {formatNotificationDeliveryTargetGroup(row, t)}
                    </TableCell>
                    <TableCell className="max-w-md text-sm">
                      {formatGroupedDeliveryStatus(g.statusCounts, t)}
                    </TableCell>
                    <TableCell>{formatIso(g.createdAt, 'yyyy-MM-dd HH:mm')}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">{t('notifications.routine_runs')}</h3>
        <div className="max-h-96 overflow-auto overscroll-contain rounded-md border [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('notifications.schedule')}</TableHead>
              <TableHead>{t('notifications.status')}</TableHead>
              <TableHead>{t('notifications.col.started')}</TableHead>
              <TableHead>{t('notifications.col.enqueued')}</TableHead>
              <TableHead>error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runsLoading ? (
              <TableRow>
                <TableCell colSpan={5}>{t('loading')}</TableCell>
              </TableRow>
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  {t('notifications.runs_empty')}
                </TableCell>
              </TableRow>
            ) : (
              runs.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.schedule_id}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{formatIso(row.started_at, 'yyyy-MM-dd HH:mm')}</TableCell>
                  <TableCell>{row.deliveries_enqueued}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-destructive">
                    {row.error_message ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </section>
    </div>
  );
}

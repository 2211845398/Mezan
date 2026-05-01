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

import { useNotificationDeliveries, useNotificationRuns } from '../../queries';

export default function NotificationHistory() {
  const { t } = useTranslation('admin');
  const { data: deliveries = [], isLoading: deliveriesLoading } = useNotificationDeliveries();
  const { data: runs = [], isLoading: runsLoading } = useNotificationRuns();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('notifications.history_title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('notifications.history_lead')}</p>
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">{t('notifications.delivery_history')}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('notifications.message_title')}</TableHead>
              <TableHead>{t('notifications.recipient')}</TableHead>
              <TableHead>{t('notifications.status')}</TableHead>
              <TableHead>{t('notifications.created_at')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveriesLoading ? (
              <TableRow>
                <TableCell colSpan={4}>{t('loading')}</TableCell>
              </TableRow>
            ) : deliveries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  {t('notifications.history_empty')}
                </TableCell>
              </TableRow>
            ) : (
              deliveries.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="max-w-md">
                      <p className="truncate font-medium">{row.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.body}</p>
                    </div>
                  </TableCell>
                  <TableCell>{row.user_id}</TableCell>
                  <TableCell>{t(`notifications.delivery_status.${row.status}`)}</TableCell>
                  <TableCell>{formatIso(row.created_at, 'yyyy-MM-dd HH:mm')}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">{t('notifications.routine_runs')}</h3>
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
      </section>
    </div>
  );
}

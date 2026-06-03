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

import { formatNotificationRunStatus } from '../../lib/notificationRunStatusLabel';
import { useNotificationRuns } from '../../queries';

export default function RunsList() {
  const { t } = useTranslation('admin');
  const { data: rows = [], isLoading } = useNotificationRuns();

  return (
    <div>
      <p className="text-muted-foreground mb-2 text-sm">{t('notifications.runs_lead')}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('notifications.col.run_id')}</TableHead>
            <TableHead>{t('notifications.schedule')}</TableHead>
            <TableHead>{t('notifications.status')}</TableHead>
            <TableHead>{t('notifications.col.started')}</TableHead>
            <TableHead>{t('notifications.col.finished')}</TableHead>
            <TableHead>{t('notifications.col.enqueued')}</TableHead>
            <TableHead>{t('notifications.col.error')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7}>{t('loading')}</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground text-sm">
                {t('notifications.runs_empty')}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.id}</TableCell>
                <TableCell>{r.schedule_id}</TableCell>
                <TableCell>{formatNotificationRunStatus(t, r.status)}</TableCell>
                <TableCell>{formatIso(r.started_at, 'yyyy-MM-dd HH:mm')}</TableCell>
                <TableCell>
                  {r.finished_at ? formatIso(r.finished_at, 'yyyy-MM-dd HH:mm') : '—'}
                </TableCell>
                <TableCell>{r.deliveries_enqueued}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-destructive">
                  {r.error_message ?? '—'}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

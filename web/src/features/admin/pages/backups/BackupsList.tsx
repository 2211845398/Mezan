import { useTranslation } from 'react-i18next';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { notify } from '@/lib/toast';

import { useBackupStatus, useRunBackup } from '../../queries';

export default function BackupsList() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { data: status, isLoading } = useBackupStatus();
  const run = useRunBackup();
  const canRun = usePermission('backups', 'run');
  const inProgress = Boolean(status?.started_at && !status?.finished_at);

  const rows: Array<{
    started: string | null;
    finished: string | null;
    size: string;
    st: string;
    file: string | null;
  }> = status
    ? [
        {
          started: status.started_at,
          finished: status.finished_at,
          size: '—',
          st: status.success ? t('backups.status.ok') : t('backups.status.fail'),
          file: status.output_file,
        },
      ]
    : [];

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('backups.title')}</h1>
        {canRun ? (
          <Button
            onClick={() => {
              void run
                .mutateAsync()
                .then(() => notify.success(tc('toasts.backup_started')))
                .catch((error) => notifyApiError(error, tc('errors.generic')));
            }}
            disabled={run.isPending || inProgress}
          >
            {t('backups.trigger')}
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground mb-2 text-sm">{status?.message}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('backups.col.started')}</TableHead>
            <TableHead>{t('backups.col.finished')}</TableHead>
            <TableHead>{t('backups.col.status')}</TableHead>
            <TableHead>{t('backups.col.file')}</TableHead>
            <TableHead>{t('backups.col.s3')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5}>
                {t('loading')}
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground text-sm">
                {t('backups.empty')}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>
                  {r.started ? formatIso(r.started, 'yyyy-MM-dd HH:mm') : '—'}
                </TableCell>
                <TableCell>
                  {r.finished ? formatIso(r.finished, 'yyyy-MM-dd HH:mm') : '—'}
                </TableCell>
                <TableCell>{r.st}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs">{r.file ?? '—'}</TableCell>
                <TableCell>{status?.s3_uploaded ? t('yes') : t('no')}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

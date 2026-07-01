import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, HardDrive, RefreshCw, CheckCircle2, XCircle, Cloud } from 'lucide-react';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

import {
  useBackupStatus,
  useBackupHistory,
  useRunBackup,
  useDownloadBackup,
} from '../../queries';
import type { BackupFileRead } from '../../types';

export default function BackupsList() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');

  // Pagination state
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Queries and mutations
  const { data: status, isLoading: statusLoading } = useBackupStatus();
  const { data: history, isLoading: historyLoading } = useBackupHistory(limit, offset);
  const run = useRunBackup();
  const download = useDownloadBackup();

  const canRead = usePermission('backups', 'read');
  const canRun = usePermission('backups', 'run');
  const inProgress = Boolean(status?.started_at && !status?.finished_at);

  const handleDownload = async (filename: string) => {
    try {
      const blob = await download.mutateAsync(filename);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      notify.success(t('backups.download.success'));
    } catch (err) {
      notifyApiError(err, t('backups.download.error'));
    }
  };

  const formatStatus = (success: boolean) => {
    return success ? (
      <span className="inline-flex items-center gap-1 text-green-600">
        <CheckCircle2 className="h-4 w-4" />
        {t('backups.status.ok')}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-red-600">
        <XCircle className="h-4 w-4" />
        {t('backups.status.fail')}
      </span>
    );
  };

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
            <RefreshCw className={`mr-2 h-4 w-4 ${inProgress ? 'animate-spin' : ''}`} />
            {t('backups.trigger')}
          </Button>
        ) : null}
      </div>

      {/* Last Backup Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardDrive className="h-5 w-5" />
            {t('backups.lastStatus.title')}
          </CardTitle>
          <CardDescription>{t('backups.lastStatus.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <p className="text-muted-foreground">{t('loading')}</p>
          ) : status ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-sm">{t('backups.col.started')}</p>
                <p className="font-medium">
                  {status.started_at
                    ? formatIso(status.started_at, 'yyyy-MM-dd HH:mm')
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">{t('backups.col.finished')}</p>
                <p className="font-medium">
                  {status.finished_at
                    ? formatIso(status.finished_at, 'yyyy-MM-dd HH:mm')
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">{t('backups.col.status')}</p>
                <p>{formatStatus(status.success)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">{t('backups.col.s3')}</p>
                <p className="flex items-center gap-1">
                  {status.s3_uploaded ? (
                    <>
                      <Cloud className="h-4 w-4 text-blue-500" />
                      <span>{t('yes')}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t('no')}</span>
                  )}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <p className="text-muted-foreground text-sm">{t('backups.col.file')}</p>
                <p className="font-mono text-sm truncate">
                  {status.output_file ?? t('backups.noFile')}
                </p>
              </div>
              {status.message && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <p className="text-muted-foreground text-sm">{t('backups.col.message')}</p>
                  <p className="text-sm">{status.message}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">{t('backups.noStatus')}</p>
          )}
        </CardContent>
      </Card>

      {/* Backup History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('backups.history.title')}</CardTitle>
          <CardDescription>{t('backups.history.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('backups.col.started')}</TableHead>
                <TableHead>{t('backups.col.size')}</TableHead>
                <TableHead>{t('backups.col.status')}</TableHead>
                <TableHead>{t('backups.col.s3')}</TableHead>
                <TableHead>{t('backups.col.file')}</TableHead>
                <TableHead className="w-[100px]">{t('actions.download')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    {t('loading')}
                  </TableCell>
                </TableRow>
              ) : history?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-center text-sm">
                    {t('backups.history.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                history?.items.map((item: BackupFileRead) => (
                  <TableRow key={item.filename}>
                    <TableCell>
                      {item.started_at
                        ? formatIso(item.started_at, 'yyyy-MM-dd HH:mm')
                        : '—'}
                    </TableCell>
                    <TableCell>{item.size_label}</TableCell>
                    <TableCell>{formatStatus(item.success)}</TableCell>
                    <TableCell>
                      {item.s3_uploaded ? (
                        <Cloud className="h-4 w-4 text-blue-500" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      {item.filename}
                    </TableCell>
                    <TableCell>
                      {canRead && item.success && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(item.filename)}
                          disabled={download.isPending}
                          title={t('backups.download.button')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {history && history.total > limit && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {t('backups.history.showing', {
                  from: offset + 1,
                  to: Math.min(offset + limit, history.total),
                  total: history.total,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset((o) => Math.max(0, o - limit))}
                  disabled={offset === 0}
                >
                  {t('pagination.prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset((o) => o + limit)}
                  disabled={offset + limit >= history.total}
                >
                  {t('pagination.next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

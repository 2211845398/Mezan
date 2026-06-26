import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-qr-code';

import { Button } from '@/components/ui/button';

import { useMyAttendanceKioskQr } from '../../attendanceDevices/queries';

export default function AttendanceKioskDisplay() {
  const { t } = useTranslation('hr');
  const query = useMyAttendanceKioskQr(true);

  useEffect(() => {
    const el = document.documentElement;
    const prev = el.className;
    el.classList.add('h-full');
    document.body.classList.add('h-full', 'overflow-hidden');
    return () => {
      el.className = prev;
      document.body.classList.remove('h-full', 'overflow-hidden');
    };
  }, []);

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">{t('attendanceDevices.kioskLoading')}</p>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
        <p className="text-destructive">{t('attendanceDevices.kioskError')}</p>
        <Button onClick={() => void query.refetch()}>{t('attendanceDevices.retry')}</Button>
      </div>
    );
  }

  const { qr_payload, branch_id, expires_in_seconds } = query.data;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center">
      <h1 className="mb-2 text-3xl font-semibold">{t('attendanceDevices.kioskTitle')}</h1>
      <p className="text-muted-foreground mb-8 text-lg">
        {t('attendanceDevices.kioskSubtitle', { branchId: branch_id })}
      </p>
      <div className="rounded-2xl bg-white p-6 shadow-lg">
        <QRCode value={qr_payload} size={320} />
      </div>
      <p className="text-muted-foreground mt-8 text-sm">
        {t('attendanceDevices.kioskRefresh', { seconds: expires_in_seconds })}
      </p>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import type { ReceiveLineProgress } from '../lib/receiveLineProgress';

type Props = {
  progress: ReceiveLineProgress;
  className?: string;
};

export default function ReceiveLineProgressHint({ progress, className }: Props) {
  const { t } = useTranslation('purchasing');

  return (
    <p
      className={cn(
        'text-xs',
        progress.exceeds ? 'font-medium text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      {t('orders.receive.progress_expected', { count: progress.ordered })} ·{' '}
      {t('orders.receive.progress_received', { count: progress.receivedDisplay })} ·{' '}
      {t('orders.receive.progress_open', { count: progress.remainingDisplay })}
      {progress.exceeds ? ` · ${t('orders.receive.progress_exceeds')}` : ''}
    </p>
  );
}

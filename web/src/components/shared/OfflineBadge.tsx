import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

export type OfflineBadgeProps = {
  online: boolean;
  className?: string;
};

/**
 * Small status pill for network connectivity (POS shell + shared layouts).
 */
export function OfflineBadge({ online, className }: OfflineBadgeProps) {
  const { t } = useTranslation('pos');

  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
        online ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/15 text-destructive',
        className,
      )}
    >
      {online ? t('shell.online') : t('shell.offline')}
    </span>
  );
}

import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-2" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="flex items-center gap-3">
          {Array.from({ length: cols }).map((__, cIdx) => (
            <Skeleton key={cIdx} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function TableEmpty({ title, description }: { title?: ReactNode; description?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground"
    >
      <Inbox className="size-8" aria-hidden="true" />
      <p className="font-medium">{title ?? t('table.empty_title')}</p>
      <p className="text-sm">{description ?? t('table.empty_body')}</p>
    </div>
  );
}

export function TableError({ onRetry }: { onRetry?: (() => void) | undefined }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 p-10 text-center text-destructive"
    >
      <AlertTriangle className="size-8" aria-hidden="true" />
      <p className="font-medium">{t('table.error_title')}</p>
      <p className="text-sm text-muted-foreground">{t('table.error_body')}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="me-2 size-4" aria-hidden="true" />
          {t('actions.retry')}
        </Button>
      ) : null}
    </div>
  );
}

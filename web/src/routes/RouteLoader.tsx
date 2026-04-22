import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function RouteLoader() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] items-center justify-center text-muted-foreground"
    >
      <Loader2 className="size-6 animate-spin" aria-hidden="true" />
      <span className="sr-only">{t('auth:actions.loading')}</span>
    </div>
  );
}

import { CloudOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useRevalidator } from 'react-router-dom';

import { getHealth } from '@/api/health';

export default function OfflinePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const busy = revalidator.state !== 'idle';

  async function onRetry() {
    revalidator.revalidate();
    // Give the revalidation loop a tick; if the user came here via a failed
    // navigation, send them back to the dashboard once the network clears.
    try {
      await getHealth();
      navigate('/dashboard', { replace: true });
    } catch {
      // stay on /offline; toast will already have been surfaced by the
      // Axios interceptor on the previous failure.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="max-w-md space-y-6 text-center">
        <CloudOff className="mx-auto size-12 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t('auth:errors.offline_title')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth:errors.offline_body')}</p>
        </div>
        <button
          type="button"
          onClick={() => void onRetry()}
          disabled={busy}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? t('auth:actions.retrying') : t('auth:actions.retry')}
        </button>
      </div>
    </div>
  );
}

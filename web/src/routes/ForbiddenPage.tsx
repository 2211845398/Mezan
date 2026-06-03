import { ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/features/auth/stores/authStore';

export default function ForbiddenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const authStatus = useAuthStore((s) => s.status);
  const state = location.state as { resource?: string; action?: string } | null;

  useEffect(() => {
    if (authStatus === 'authenticated') {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatus, navigate]);

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background px-4 py-12">
      <div className="max-w-md space-y-6 text-center">
        <ShieldAlert className="mx-auto size-12 text-destructive" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t('auth:errors.forbidden_title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('auth:errors.forbidden_body')}
          </p>
          {state?.resource && state.action ? (
            <p className="text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1.5 py-0.5">
                {state.resource}:{state.action}
              </code>
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            {t('auth:actions.go_back')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('auth:actions.go_home')}
          </button>
        </div>
      </div>
    </div>
  );
}

import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background px-4 py-12">
      <div className="max-w-md space-y-6 text-center">
        <Compass className="mx-auto size-12 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t('auth:errors.not_found_title')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth:errors.not_found_body')}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('auth:actions.go_home')}
        </button>
      </div>
    </div>
  );
}

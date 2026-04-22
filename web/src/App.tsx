import { useTranslation } from 'react-i18next';

import AdminLayout from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';

/*
 * W-1 scaffolding surface. Router wiring and the real `/dashboard` page land
 * in Epic W-2. Until then we render `AdminLayout` directly with a placeholder
 * so the sidebar, topbar, Arabic fonts, RTL direction, Tailwind tokens, and
 * theme toggle can be verified end-to-end.
 */

export default function App() {
  const { t, i18n } = useTranslation();
  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('layout.app_name')} — {t('nav.dashboard')}
        </h1>
        <p className="text-muted-foreground">W-1 scaffolding — sign-in and routing land in W-2.</p>
        <div className="flex items-center gap-3">
          <Button type="button">{t('actions.confirm')}</Button>
          <Button type="button" variant="outline">
            {t('actions.cancel')}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          <span>{t('layout.toggle_language')}: </span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{i18n.language}</code>
        </p>
      </div>
    </AdminLayout>
  );
}

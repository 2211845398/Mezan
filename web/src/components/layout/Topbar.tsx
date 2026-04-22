import { Languages, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import ThemeToggle from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { logout as logoutApi } from '@/features/auth/api';
import { getRefreshTokenSync, useAuthStore } from '@/features/auth/stores/authStore';

export function Topbar() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  function toggleLang() {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    void i18n.changeLanguage(next);
  }

  async function onSignOut() {
    const token = getRefreshTokenSync();
    try {
      if (token) await logoutApi({ refresh_token: token });
    } catch {
      // Best-effort: we revoke locally regardless of backend reachability.
    } finally {
      clear();
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="text-lg font-semibold">{t('layout.app_name')}</div>
      <div className="flex items-center gap-2">
        {user?.full_name || user?.email ? (
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user.full_name ?? user.email}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleLang}
          aria-label={t('layout.toggle_language')}
        >
          <Languages className="size-4" />
        </Button>
        <ThemeToggle />
        {user ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              void onSignOut();
            }}
            aria-label={t('layout.sign_out')}
          >
            <LogOut className="size-4" />
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export default Topbar;

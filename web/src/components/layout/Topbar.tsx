import { Languages, LogOut, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import ThemeToggle from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useFilteredNavigation } from '@/config/navigationFilter';
import { getTitleKeyForPath } from '@/config/routeTitle';
import { logout as logoutApi } from '@/features/auth/api';
import { getRefreshTokenSync, useAuthStore } from '@/features/auth/stores/authStore';
import { NotificationCenter } from '@/features/notifications/NotificationCenter';
import { cn } from '@/lib/utils';
import { useShellStore } from '@/stores/shellStore';

import { SidebarNav } from './SidebarNav';

export function Topbar() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const visible = useFilteredNavigation();
  const mobileNavOpen = useShellStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useShellStore((s) => s.setMobileNavOpen);

  const titleKey = getTitleKeyForPath(location.pathname);
  const sheetSide = i18n.dir() === 'rtl' ? 'right' : 'left';

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
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 lg:hidden"
            aria-label={t('layout.open_sidebar')}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight">{t(titleKey)}</h1>
            {user?.branch_id != null ? (
              <p className="truncate text-xs text-muted-foreground">
                {t('layout.branch_context', { id: user.branch_id })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {user?.full_name || user?.email ? (
            <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground md:inline">
              {user.full_name ?? user.email}
            </span>
          ) : null}
          {/* EN: N → L → T → out (LTR). AR: reverse visual order (flex-row-reverse) while DOM stays keyboard-friendly. */}
          <div
            className={cn('flex items-center gap-2', i18n.language.startsWith('ar') && 'flex-row-reverse')}
            dir="ltr"
          >
            {user ? <NotificationCenter /> : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleLang}
              aria-label={t('layout.toggle_language')}
            >
              <Languages className="size-5" />
            </Button>
            <ThemeToggle />
            {user ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  void onSignOut();
                }}
                aria-label={t('layout.sign_out')}
              >
                <LogOut className="size-5" />
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side={sheetSide}
          className="flex w-full max-w-[min(100%,20rem)] flex-col gap-0 overflow-hidden p-0"
        >
          <SheetHeader className="border-b border-border px-4 py-4 text-start">
            <SheetTitle>{t('layout.menu')}</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SidebarNav
              items={visible}
              variant="sheet"
              onItemNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default Topbar;

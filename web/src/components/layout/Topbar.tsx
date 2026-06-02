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
import { useShellNavigation } from '@/config/navigationFilter';
import { getTitleKeyForPath } from '@/config/routeTitle';
import { useBranch } from '@/features/admin/queries';
import { logout as logoutApi } from '@/features/auth/api';
import { getRefreshTokenSync, useAuthStore } from '@/features/auth/stores/authStore';
import { NotificationCenter } from '@/features/notifications/NotificationCenter';
import { formatPersonName } from '@/lib/personName';
import { cn } from '@/lib/utils';
import { useShellStore } from '@/stores/shellStore';

import { SidebarNav } from './SidebarNav';
import { SidebarProfile } from './SidebarProfile';

export function Topbar() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const branchId = useAuthStore((s) => s.activeBranchId ?? s.user?.branch_id ?? null);
  const { data: branchRow } = useBranch(branchId ?? 0, {
    enabled: branchId != null && branchId > 0,
  });
  const visible = useShellNavigation();
  const mobileNavOpen = useShellStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useShellStore((s) => s.setMobileNavOpen);

  const titleKey = getTitleKeyForPath(location.pathname);
  const sheetSide = i18n.dir() === 'rtl' ? 'right' : 'left';
  const isPosShell = location.pathname.startsWith('/pos');

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

  const userDisplay = user
    ? formatPersonName(user.first_name, user.father_name, user.family_name).trim() || user.email
    : null;

  return (
    <>
      {isPosShell ? (
        /* POS: hide full app topbar on desktop (sidebar stays). Mobile still needs a menu trigger because Sidebar is lg-only. */
        <header className="flex h-12 shrink-0 items-center border-b bg-background px-3 lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={t('layout.open_sidebar')}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
        </header>
      ) : (
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
              {branchId != null ? (
                <p className="truncate text-xs text-muted-foreground">
                  {branchRow?.name?.trim() || t('layout.branch_context', { id: branchId })}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {userDisplay ? (
              <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground md:inline">
                {userDisplay}
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
      )}

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
          <div className="shrink-0 border-t border-border p-3">
            <SidebarProfile collapsed={false} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default Topbar;

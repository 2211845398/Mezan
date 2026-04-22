import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { navigation, type NavItem } from '@/config/navigation';
import { useAuthStore } from '@/features/auth/stores/authStore';

/*
 * Minimal W-2 dashboard: greets the user, shows their branch, and lists every
 * sidebar item they actually have permission for. Epic W-5.8 replaces this
 * with the executive BI widgets.
 */

function flattenAccessible(
  items: NavItem[],
  has: (resource: string, action: string) => boolean,
): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      const accessibleChildren = flattenAccessible(item.children, has);
      out.push(...accessibleChildren);
    } else if (!item.permission) {
      out.push(item);
    } else if (has(item.permission.resource, item.permission.action)) {
      out.push(item);
    }
  }
  return out;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const branchId = useAuthStore((s) => s.activeBranchId);
  const permissions = useAuthStore((s) => s.permissions);

  const accessible = useMemo(() => {
    const has = (resource: string, action: string) =>
      permissions.has(`${resource}:${action}`);
    return flattenAccessible(navigation, has);
  }, [permissions]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('auth:dashboard.hello', {
            name: user?.full_name ?? user?.email ?? t('auth:dashboard.user_fallback'),
          })}
        </h1>
        <p className="text-muted-foreground">
          {branchId === null
            ? t('auth:dashboard.no_branch')
            : t('auth:dashboard.branch', { id: branchId })}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('auth:dashboard.your_access')}</h2>
        {accessible.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t('auth:dashboard.no_access')}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {accessible.map((item) => (
              <li
                key={item.key}
                className="rounded-md border border-border p-3 text-sm hover:bg-accent"
              >
                <a href={item.href} className="flex items-center gap-3">
                  <item.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span>{t(item.labelKey)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

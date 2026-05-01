import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import { useOrgNotificationManager } from '@/hooks/useOrgNotificationManager';
import { cn } from '@/lib/utils';

const allTabs = [
  { to: 'send-now', labelKey: 'notifications.tab_send_now' as const },
  { to: 'routine', labelKey: 'notifications.tab_routine' as const },
  { to: 'history', labelKey: 'notifications.tab_history' as const },
];

export default function NotificationsLayout() {
  const { t } = useTranslation('admin');
  const canOrgNotificationAdmin = useOrgNotificationManager();
  const tabs = canOrgNotificationAdmin
    ? allTabs
    : allTabs.filter((tab) => tab.to === 'routine');

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-semibold">{t('notifications.title')}</h1>
      <nav className="mb-4 flex flex-wrap gap-2 border-b pb-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn('rounded-md px-3 py-1.5 text-sm', isActive ? 'bg-muted font-medium' : 'text-muted-foreground')
            }
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

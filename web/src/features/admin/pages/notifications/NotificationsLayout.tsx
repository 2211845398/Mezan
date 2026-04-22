import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import { cn } from '@/lib/utils';

const tabs = [
  { to: 'templates', labelKey: 'notifications.tab_templates' as const },
  { to: 'schedules', labelKey: 'notifications.tab_schedules' as const },
  { to: 'runs', labelKey: 'notifications.tab_runs' as const },
];

export default function NotificationsLayout() {
  const { t } = useTranslation('admin');
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

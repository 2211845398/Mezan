import { Bell, CalendarClock, History, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';

import { PageTabNav } from '@/components/shared/PageTabNav';
import { useOrgNotificationManager } from '@/hooks/useOrgNotificationManager';

const allTabs = [
  { to: 'send-now', labelKey: 'notifications.tab_send_now' as const, icon: Send },
  { to: 'routine', labelKey: 'notifications.tab_routine' as const, icon: CalendarClock },
  { to: 'history', labelKey: 'notifications.tab_history' as const, icon: History },
];

export default function NotificationsLayout() {
  const { t } = useTranslation('admin');
  const canOrgNotificationAdmin = useOrgNotificationManager();
  const tabs = (canOrgNotificationAdmin ? allTabs : allTabs.filter((tab) => tab.to === 'routine')).map(
    (tab) => ({
      to: tab.to,
      label: t(tab.labelKey),
      icon: tab.icon,
    }),
  );

  return (
    <div className="p-4">
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <Bell className="size-6 shrink-0" aria-hidden />
        {t('notifications.title')}
      </h1>
      <PageTabNav mode="navlink" items={tabs} className="mb-4" />
      <Outlet />
    </div>
  );
}

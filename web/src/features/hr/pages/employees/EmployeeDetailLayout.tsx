import type { LucideIcon } from 'lucide-react';
import { Activity, Calendar, CalendarDays, Clock, FolderCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useParams } from 'react-router-dom';

import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export default function EmployeeDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('hr');

  const navItems: NavItem[] = [
    { to: `/hr/employees/${id}/performance`, label: t('tracking.performance'), icon: Activity },
    { to: `/hr/employees/${id}/data`, label: t('tracking.data'), icon: FolderCog },
    { to: `/hr/employees/${id}/attendance`, label: t('tracking.attendance'), icon: Clock },
    { to: `/hr/employees/${id}/leave`, label: t('tracking.leave'), icon: Calendar },
    { to: `/hr/employees/${id}/schedule`, label: t('tracking.schedule'), icon: CalendarDays },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('tracking.title')}
        actions={<BackButton to="/hr/employees" label={t('employees.title')} />}
      />

      <nav className="flex flex-wrap gap-2 border-b pb-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}

import { Activity, Calendar, CalendarDays, Clock, FolderCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Outlet, useParams } from 'react-router-dom';

import { PageTabNav } from '@/components/shared/PageTabNav';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';

export default function EmployeeDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('hr');

  const navItems = [
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

      <PageTabNav mode="navlink" items={navItems} className="mb-0" />

      <Outlet />
    </div>
  );
}

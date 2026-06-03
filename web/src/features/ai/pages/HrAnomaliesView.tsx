import { useTranslation } from 'react-i18next';

import AnomaliesDashboard from '@/features/hr/pages/anomalies/AnomaliesDashboard';

export default function HrAnomaliesView() {
  const { t } = useTranslation('ai');
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground">{t('hr.intro')}</p>
      <AnomaliesDashboard />
    </div>
  );
}

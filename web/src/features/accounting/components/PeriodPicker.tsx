import { useTranslation } from 'react-i18next';

import { DateField } from '@/components/shared/form/DateField';
import { Label } from '@/components/ui/label';

type Props = {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
};

export default function PeriodPicker({ dateFrom, dateTo, onDateFromChange, onDateToChange }: Props) {
  const { t } = useTranslation('accounting');
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <Label>{t('period.from')}</Label>
        <DateField value={dateFrom} onChange={onDateFromChange} />
      </div>
      <div className="grid gap-1">
        <Label>{t('period.to')}</Label>
        <DateField value={dateTo} onChange={onDateToChange} />
      </div>
    </div>
  );
}

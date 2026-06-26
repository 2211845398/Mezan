import { useTranslation } from 'react-i18next';

import { DateRangeFields } from '@/components/shared/form/DateRangeFields';
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
    <DateRangeFields
      fromValue={dateFrom}
      toValue={dateTo}
      onFromChange={onDateFromChange}
      onToChange={onDateToChange}
      fromLabel={<Label>{t('period.from')}</Label>}
      toLabel={<Label>{t('period.to')}</Label>}
    />
  );
}

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { currenciesQueryOptions } from '../queries';

type CurrencySelectProps = {
  value: string;
  onValueChange: (code: string) => void;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
};

export default function CurrencySelect({
  value,
  onValueChange,
  disabled,
  placeholder,
}: CurrencySelectProps) {
  const { t } = useTranslation('accounting');
  const { data: currencies = [], isLoading } = useQuery(currenciesQueryOptions(false));

  const selectValue = value.trim() === '' ? undefined : value;
  return (
    <Select
      {...(selectValue !== undefined ? { value: selectValue } : {})}
      onValueChange={onValueChange}
      disabled={Boolean(disabled) || isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? t('currencies.select_placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {currencies.map((c) => (
          <SelectItem key={c.id} value={c.code}>
            {c.code} — {c.name}
            {c.is_base ? ` (${t('currencies.base_badge')})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

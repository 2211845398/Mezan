import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import type { ProductUomOption } from '../lib/productUomOptions';

type Props = {
  disabled?: boolean;
  uomId: number;
  options: ProductUomOption[];
  onChange: (uomId: number) => void;
  fullWidth?: boolean;
};

export default function PoLineUomSelect({
  disabled,
  uomId,
  options,
  onChange,
  fullWidth = false,
}: Props) {
  const { i18n } = useTranslation('purchasing');
  const fieldDir = i18n.dir();
  const widthClass = fullWidth ? 'w-full min-w-0' : 'max-w-[11rem]';

  if (options.length <= 1) {
    const only = options[0];
    return (
      <div
        className={cn(
          'flex h-9 items-center truncate rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground',
          widthClass,
        )}
        dir={fieldDir}
        title={only?.label}
      >
        {only?.label ?? '—'}
      </div>
    );
  }

  return (
    <Select
      value={uomId > 0 ? String(uomId) : undefined}
      onValueChange={(v) => onChange(Number(v))}
      disabled={disabled || uomId <= 0}
    >
      <SelectTrigger dir={fieldDir} className={cn('h-9', widthClass)}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent dir={fieldDir}>
        {options.map((opt) => (
          <SelectItem key={opt.id} value={String(opt.id)}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

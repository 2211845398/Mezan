import { Check, Rows3, Rows4 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { Density } from './types';

export function DensityToggle({
  density,
  onChange,
}: {
  density: Density;
  onChange: (next: Density) => void;
}) {
  const { t } = useTranslation();
  const Icon = density === 'compact' ? Rows4 : Rows3;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={t('table.density')}>
          <Icon className="me-2 size-4" aria-hidden="true" />
          {t(`table.density_${density}`)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('table.density')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(['compact', 'normal', 'comfortable'] as const).map((d) => (
          <DropdownMenuItem key={d} onClick={() => onChange(d)}>
            {density === d ? (
              <Check className="me-2 size-4" aria-hidden="true" />
            ) : (
              <span className="me-2 inline-block size-4" aria-hidden="true" />
            )}
            {t(`table.density_${d}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const DENSITY_ROW_CLASS: Record<Density, string> = {
  compact: 'h-8',
  normal: 'h-10',
  comfortable: 'h-14',
};

export const DENSITY_CELL_CLASS: Record<Density, string> = {
  compact: 'py-1 px-3 text-xs',
  normal: 'py-2 px-4 text-sm',
  comfortable: 'py-3 px-4 text-sm',
};

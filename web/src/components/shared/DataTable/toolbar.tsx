import type { Table } from '@tanstack/react-table';
import { Download, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { DensityToggle } from './density';
import type { Density } from './types';
import { ColumnVisibilityMenu } from './visibility';

export function Toolbar<TData>({
  table,
  searchValue,
  onSearchChange,
  density,
  onDensityChange,
  onExport,
  toolbarExtras,
}: {
  table: Table<TData>;
  searchValue: string;
  onSearchChange: (next: string) => void;
  density: Density;
  onDensityChange: (next: Density) => void;
  onExport?: ((table: Table<TData>) => void) | undefined;
  toolbarExtras?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
      <div className="relative w-full max-w-xs">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('table.search_placeholder')}
          aria-label={t('table.search_placeholder')}
          className="ps-9"
        />
        {searchValue ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={t('actions.clear')}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {toolbarExtras}
        <DensityToggle density={density} onChange={onDensityChange} />
        <ColumnVisibilityMenu table={table} />
        {onExport ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onExport(table)}
            aria-label={t('table.export')}
          >
            <Download className="me-2 size-4" aria-hidden="true" />
            {t('table.export')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type InventoryListHeaderProps = {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Page title and action buttons (RTL-first). */
export function InventoryListHeader({ title, actions, className }: InventoryListHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <h1 className="text-xl font-semibold leading-tight">{title}</h1>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export type InventoryProductSearchFieldProps = {
  searchId: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
};

/** Product search for DataTable `toolbarLeading` (same row as density / columns). */
export function InventoryProductSearchField({
  searchId,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
}: InventoryProductSearchFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={searchId}>{searchLabel}</Label>
      <Input
        id={searchId}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
      />
    </div>
  );
}

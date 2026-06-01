import type { Table } from '@tanstack/react-table';
import { Check, Settings2 } from 'lucide-react';
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

/*
 * Column visibility menu. The consumer-provided `onChange` is invoked with
 * the full visibility map so the parent can persist the choice per-route
 * in `localStorage` (Plan §7.1). Items use `DropdownMenuItem` (role=menuitem)
 * instead of checkboxes so Radix's pointer capture stays consistent with
 * the rest of the dropdown.
 */
export function ColumnVisibilityMenu<TData>({
  table,
}: {
  table: Table<TData>;
}) {
  const { t } = useTranslation();
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={t('table.columns')}>
          <Settings2 className="me-2 size-4" aria-hidden="true" />
          {t('table.columns')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('table.columns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => {
          const meta = column.columnDef.meta as { visibilityLabel?: string } | undefined;
          const header = column.columnDef.header;
          const fallback =
            meta?.visibilityLabel ??
            (typeof header === 'string' ? header : column.id);
          const label = t(`table.columns_${column.id}`, {
            defaultValue: fallback,
          });
          const visible = column.getIsVisible();
          return (
            <DropdownMenuItem
              key={column.id}
              // TanStack calls `onColumnVisibilityChange` on toggle; the
              // DataTable's own handler persists to localStorage, so we do
              // not fire a second setter here (which would race the first).
              onClick={() => column.toggleVisibility(!visible)}
            >
              {visible ? (
                <Check className="me-2 size-4" aria-hidden="true" />
              ) : (
                <span className="me-2 inline-block size-4" aria-hidden="true" />
              )}
              <span className="select-none">{label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

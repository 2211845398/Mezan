import type { ColumnDef, Row } from '@tanstack/react-table';

/*
 * Helpers for building column definitions with the generic preserved.
 * Usage: `const cols = defineColumns<Invoice>()( [...] )`.
 */

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Header and body text alignment for DataTable cells. */
    align?: 'start' | 'center' | 'end';
    /** Label in the column visibility dropdown (when header is not a plain string). */
    visibilityLabel?: string;
    /** Hide this column by default until the user enables it. */
    defaultHidden?: boolean;
  }
}

export function columnAlignClass(align?: 'start' | 'center' | 'end') {
  return align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start';
}

export function defineColumns<TData>() {
  return <TValue = unknown>(
    columns: ColumnDef<TData, TValue>[],
  ): ColumnDef<TData, TValue>[] => columns;
}

export function selectionColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: '__select',
    enableHiding: false,
    enableSorting: false,
    size: 32,
    header: ({ table }) => (
      <input
        type="checkbox"
        aria-label="Select all"
        checked={table.getIsAllPageRowsSelected()}
        onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
      />
    ),
    cell: ({ row }: { row: Row<TData> }) => (
      <input
        type="checkbox"
        aria-label="Select row"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
      />
    ),
  };
}

import type { ColumnDef, Table } from '@tanstack/react-table';

/*
 * Public types for the shared `<DataTable />`. Kept in a small island so
 * feature code doesn't need to reach into TanStack Table directly for the
 * happy-path column definition shape.
 */

export type DataTableMode = 'server' | 'client';

export type Density = 'compact' | 'normal' | 'comfortable';

/**
 * Matches TanStack's `ColumnDef` contract verbatim — re-exported so feature
 * modules can import both `ColumnDef` and this `DataTable` from a single
 * entry point.
 */
export type DataTableColumn<TData, TValue = unknown> = ColumnDef<TData, TValue>;

export type SortState = { id: string; desc: boolean } | null;

export type UrlQuery = {
  page: number; // 1-based for humans, converted to 0-based internally
  pageSize: number;
  sort: SortState;
  q: string;
};

export type DataTableServerHandlers<TData> = {
  /** Invoked by the toolbar Export button, if the consumer provides one. */
  onExport?: ((table: Table<TData>) => void) | undefined;
};

export type DataTableState = {
  density: Density;
  columnVisibility: Record<string, boolean>;
};

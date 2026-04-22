import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { type ReactNode, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { DENSITY_CELL_CLASS, DENSITY_ROW_CLASS } from './density';
import { Pagination } from './pagination';
import { TableEmpty, TableError, TableSkeleton } from './states';
import { Toolbar } from './toolbar';
import type {
  DataTableColumn,
  DataTableMode,
  DataTableState,
  UrlQuery,
} from './types';
import { usePersistedTableState } from './usePersistedTableState';
import { useTableUrlState } from './useTableUrlState';

/*
 * Canonical DataTable. Single entry point for every listing screen.
 *
 *   - Server mode (default): consumer supplies already-paginated rows and
 *     `totalRows`; URL query params drive `page`, `pageSize`, `sort`, `q`.
 *   - Client mode (`mode="client"`): consumer supplies the full dataset and
 *     TanStack Table does the paging/sorting/filtering in-memory.
 *
 * Virtualization kicks in automatically past 200 rows (`@tanstack/react-virtual`).
 */

const VIRTUAL_ROW_THRESHOLD = 200;

export type DataTableProps<TData> = {
  columns: DataTableColumn<TData>[];
  data: TData[];
  /** Total row count for server-mode pagination. Ignored in client mode. */
  totalRows?: number;
  mode?: DataTableMode;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: (() => void) | undefined;
  emptyState?: ReactNode;
  initialDensity?: DataTableState['density'];
  initialVisibility?: VisibilityState;
  /** Optional consumer hook for row selection changes. */
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  /** Export button in the toolbar. The body is the consumer's responsibility. */
  onExport?: ((table: ReturnType<typeof useReactTable<TData>>) => void) | undefined;
  toolbarExtras?: ReactNode;
  /** Optional footer action bar slot (rendered when rows are selected). */
  renderActionBar?: ((selectedRows: TData[]) => ReactNode) | undefined;
  /** Defaults for URL state when no query is present. */
  defaultUrlQuery?: Partial<UrlQuery>;
  /** Estimated row height in px for the virtualizer. */
  estimatedRowHeight?: number;
};

export function DataTable<TData>({
  columns,
  data,
  totalRows,
  mode = 'server',
  isLoading = false,
  isError = false,
  onRetry,
  emptyState,
  initialDensity = 'normal',
  initialVisibility = {},
  onRowSelectionChange,
  onExport,
  toolbarExtras,
  renderActionBar,
  defaultUrlQuery,
  estimatedRowHeight = 40,
}: DataTableProps<TData>) {
  const { t } = useTranslation();

  const [{ page, pageSize, sort, q }, urlActions] = useTableUrlState(defaultUrlQuery);
  const [persisted, { setDensity, setColumnVisibility }] = usePersistedTableState({
    density: initialDensity,
    columnVisibility: initialVisibility as Record<string, boolean>,
  });

  const sorting: SortingState = useMemo(
    () => (sort ? [{ id: sort.id, desc: sort.desc }] : []),
    [sort],
  );

  const table = useReactTable<TData>({
    data,
    columns,
    state: {
      sorting,
      globalFilter: q,
      columnVisibility: persisted.columnVisibility as VisibilityState,
      pagination: { pageIndex: Math.max(0, page - 1), pageSize },
    },
    manualPagination: mode === 'server',
    manualSorting: mode === 'server',
    manualFiltering: mode === 'server',
    ...(mode === 'server'
      ? {
          pageCount: Math.max(1, Math.ceil((totalRows ?? 0) / Math.max(1, pageSize))),
        }
      : {}),
    getCoreRowModel: getCoreRowModel(),
    ...(mode === 'client'
      ? {
          getSortedRowModel: getSortedRowModel(),
          getPaginationRowModel: getPaginationRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
        }
      : {}),
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      urlActions.setSort(first ? { id: first.id, desc: first.desc } : null);
    },
    onGlobalFilterChange: (value: unknown) => {
      urlActions.setQ(typeof value === 'string' ? value : '');
    },
    onPaginationChange: (updater) => {
      const current = { pageIndex: page - 1, pageSize };
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (next.pageSize !== pageSize) urlActions.setPageSize(next.pageSize);
      if (next.pageIndex !== current.pageIndex) urlActions.setPage(next.pageIndex + 1);
    },
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility(
        typeof updater === 'function'
          ? (updater as (old: Record<string, boolean>) => Record<string, boolean>)(
              persisted.columnVisibility,
            )
          : updater,
      );
    },
    onRowSelectionChange: (updater) => {
      const prev = table.getState().rowSelection;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      onRowSelectionChange?.(next);
    },
  });

  const rows = table.getRowModel().rows;
  const totalForPagination = mode === 'server' ? (totalRows ?? 0) : data.length;
  const shouldVirtualize = rows.length >= VIRTUAL_ROW_THRESHOLD;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    enabled: shouldVirtualize,
    overscan: 10,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const rowClass = DENSITY_ROW_CLASS[persisted.density];
  const cellClass = DENSITY_CELL_CLASS[persisted.density];

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  const body = isLoading ? (
    <TableSkeleton rows={pageSize} cols={columns.length} />
  ) : isError ? (
    <TableError onRetry={onRetry} />
  ) : rows.length === 0 ? (
    (emptyState ?? <TableEmpty />)
  ) : (
    <div ref={scrollRef} className="relative w-full overflow-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={cn('text-start align-middle', cellClass)}
                    style={header.column.getSize() ? { width: header.column.getSize() } : undefined}
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                    }
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {shouldVirtualize ? (
            <>
              <tr aria-hidden="true" style={{ height: virtualItems[0]?.start ?? 0 }} />
              {virtualItems.map((v) => {
                const row = rows[v.index];
                if (!row) return null;
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={rowClass}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn('align-middle', cellClass)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
              <tr
                aria-hidden="true"
                style={{
                  height: Math.max(
                    0,
                    totalSize - (virtualItems.at(-1)?.end ?? 0),
                  ),
                }}
              />
            </>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={rowClass}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn('align-middle', cellClass)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="w-full" aria-label={t('table.label')}>
      <Toolbar
        table={table}
        searchValue={q}
        onSearchChange={urlActions.setQ}
        density={persisted.density}
        onDensityChange={setDensity}
        onExport={onExport}
        toolbarExtras={toolbarExtras}
      />

      <div className="rounded-md border">{body}</div>

      <Pagination
        page={page}
        pageSize={pageSize}
        totalRows={totalForPagination}
        onPageChange={urlActions.setPage}
        onPageSizeChange={urlActions.setPageSize}
      />

      {renderActionBar && selectedRows.length > 0 ? (
        <div className="sticky bottom-2 mt-3 rounded-md border bg-popover p-3 shadow-lg">
          {renderActionBar(selectedRows)}
        </div>
      ) : null}
    </div>
  );
}

export { defineColumns } from './columns';
export type { DataTableColumn } from './types';

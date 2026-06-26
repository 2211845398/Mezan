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
import { type KeyboardEvent, type MouseEvent, type ReactNode, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { columnAlignClass } from './columns';
import { DENSITY_CELL_CLASS, DENSITY_ROW_CLASS } from './densityClasses';
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

function isInteractiveClickTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'a, button, input, select, textarea, [role="checkbox"], [data-stop-row-click]',
    ),
  );
}

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
  /** Content on the toolbar start side when built-in search is hidden. */
  toolbarLeading?: ReactNode;
  /** Hide built-in pagination (e.g. when the parent drives offset/limit via API). */
  showPagination?: boolean;
  /** Hide the global search field (short static lists). */
  showSearch?: boolean;
  /** Optional footer action bar slot (rendered when rows are selected). */
  renderActionBar?: ((selectedRows: TData[]) => ReactNode) | undefined;
  /** Defaults for URL state when no query is present. */
  defaultUrlQuery?: Partial<UrlQuery>;
  /** Estimated row height in px for the virtualizer. */
  estimatedRowHeight?: number;
  /** Merged onto the root wrapper (e.g. `max-w-4xl` for compact tables). */
  className?: string;
  /** Merged onto the inner `<table>` (e.g. `table-fixed` with explicit column sizes). */
  tableClassName?: string;
  /** Sets `dir` on the bordered table wrapper (e.g. `rtl` for Arabic list columns). */
  tableDir?: 'rtl' | 'ltr';
  /** Stable row id for client tables (e.g. variant-level stock rows). */
  getRowId?: (row: TData) => string;
  /** Plain-text empty state when `emptyState` is not provided. */
  emptyMessage?: string | undefined;
  /** Overrides the default toolbar search placeholder. */
  searchPlaceholder?: string | undefined;
  /** Extra class names merged onto each body row. */
  getRowClassName?: (row: TData) => string | undefined;
  /** Navigate when a row is clicked (entire row is interactive). */
  getRowHref?: (row: TData) => string | undefined;
  /** Custom row click handler (runs after navigation when both are set). */
  onRowClick?: (row: TData) => void;
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
  toolbarLeading,
  showSearch = true,
  showPagination = true,
  renderActionBar,
  defaultUrlQuery,
  estimatedRowHeight = 40,
  className,
  tableClassName,
  tableDir,
  getRowId,
  emptyMessage,
  searchPlaceholder,
  getRowClassName,
  getRowHref,
  onRowClick,
}: DataTableProps<TData>) {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
    ...(getRowId ? { getRowId: (row, _index) => getRowId(row as TData) } : {}),
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

  const rowIsClickable = Boolean(getRowHref || onRowClick);

  const handleRowActivate = useCallback(
    (rowData: TData) => {
      const href = getRowHref?.(rowData);
      if (href) navigate(href);
      onRowClick?.(rowData);
    },
    [getRowHref, navigate, onRowClick],
  );

  const renderBodyRow = (row: (typeof rows)[number]) => (
    <TableRow
      key={row.id}
      data-state={row.getIsSelected() ? 'selected' : undefined}
      className={cn(
        rowClass,
        rowIsClickable && 'cursor-pointer transition-colors hover:bg-muted/50',
        getRowClassName?.(row.original),
      )}
      {...(rowIsClickable
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: (e: MouseEvent<HTMLTableRowElement>) => {
              if (isInteractiveClickTarget(e.target)) return;
              handleRowActivate(row.original);
            },
            onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              if (isInteractiveClickTarget(e.target)) return;
              e.preventDefault();
              handleRowActivate(row.original);
            },
          }
        : {})}
    >
      {row.getVisibleCells().map((cell) => {
        const cellAlign = columnAlignClass(cell.column.columnDef.meta?.align);
        return (
          <TableCell
            key={cell.id}
            className={cn('align-middle', cellAlign, cellClass)}
            style={
              cell.column.columnDef.size != null
                ? { width: cell.column.getSize(), minWidth: cell.column.getSize() }
                : undefined
            }
            onClick={
              rowIsClickable
                ? (e) => {
                    if (isInteractiveClickTarget(e.target)) e.stopPropagation();
                  }
                : undefined
            }
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </TableRow>
  );

  const body = isLoading ? (
    <TableSkeleton rows={pageSize} cols={columns.length} />
  ) : isError ? (
    <TableError onRetry={onRetry} />
  ) : rows.length === 0 ? (
    (emptyState ?? (emptyMessage ? <TableEmpty description={emptyMessage} /> : <TableEmpty />))
  ) : (
    <div ref={scrollRef} className="relative w-full overflow-auto">
      <Table className={tableClassName}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const headAlign = columnAlignClass(header.column.columnDef.meta?.align);
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={cn('align-middle', headAlign, cellClass)}
                    style={
                      header.column.columnDef.size != null
                        ? { width: header.column.getSize(), minWidth: header.column.getSize() }
                        : undefined
                    }
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
                return renderBodyRow(row);
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
            rows.map((row) => renderBodyRow(row))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className={cn('w-full', className)} aria-label={t('table.label')}>
      <Toolbar
        table={table}
        searchValue={q}
        onSearchChange={urlActions.setQ}
        density={persisted.density}
        onDensityChange={setDensity}
        onExport={onExport}
        toolbarExtras={toolbarExtras}
        toolbarLeading={toolbarLeading}
        showSearch={showSearch}
        searchPlaceholder={searchPlaceholder}
      />

      <div className="rounded-md border" dir={tableDir}>
        {body}
      </div>

      {showPagination ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalRows={totalForPagination}
          onPageChange={urlActions.setPage}
          onPageSizeChange={urlActions.setPageSize}
        />
      ) : null}

      {renderActionBar && selectedRows.length > 0 ? (
        <div className="sticky bottom-2 mt-3 rounded-md border bg-popover p-3 shadow-lg">
          {renderActionBar(selectedRows)}
        </div>
      ) : null}
    </div>
  );
}

export type { DataTableColumn } from './types';

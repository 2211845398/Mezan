import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, Clock, Filter, RefreshCw, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { cn } from '@/lib/utils';

import type { TransferRead } from '../../types';
import { useTransfersListQuery } from '../../queries';
import TransferForm from './TransferForm';

const BOARD_STATUSES = ['pending_dispatch', 'in_transit', 'received'] as const;

function totalQty(t: TransferRead): number {
  return (t.lines ?? []).reduce((a, l) => a + l.qty, 0);
}

function lineCount(t: TransferRead): number {
  return t.lines?.length ?? 0;
}

function branchLabel(t: TransferRead, which: 'from' | 'to'): string {
  if (which === 'from') {
    return t.from_branch_name?.trim() ? t.from_branch_name : String(t.from_branch_id);
  }
  return t.to_branch_name?.trim() ? t.to_branch_name : String(t.to_branch_id);
}

function createdDateKey(iso: string): string {
  return String(iso).slice(0, 10);
}

type ColumnDef = {
  status: (typeof BOARD_STATUSES)[number];
  titleKey: string;
  icon: typeof Clock;
  headerClass: string;
  iconWrapClass: string;
};

const COLUMNS: ColumnDef[] = [
  {
    status: 'pending_dispatch',
    titleKey: 'transfers.board.column_pending',
    icon: Clock,
    headerClass: 'text-amber-900 dark:text-amber-100',
    iconWrapClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  {
    status: 'in_transit',
    titleKey: 'transfers.board.column_transit',
    icon: Truck,
    headerClass: 'text-violet-900 dark:text-violet-100',
    iconWrapClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  },
  {
    status: 'received',
    titleKey: 'transfers.board.column_received',
    icon: CheckCircle2,
    headerClass: 'text-emerald-900 dark:text-emerald-100',
    iconWrapClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
];

function TransferBoardCard({ t, row }: { t: (k: string, o?: object) => string; row: TransferRead }) {
  const from = branchLabel(row, 'from');
  const to = branchLabel(row, 'to');
  const n = lineCount(row);
  const q = totalQty(row);
  return (
    <Link
      to={`/inventory/transfers/${row.id}`}
      className="block rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/90">{t('transfers.col.transfer_no')}</span>{' '}
          <span className="font-mono tabular-nums num-latin">{row.id}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {formatIso(String(row.created_at), 'yyyy-MM-dd HH:mm')}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium leading-snug">
        {from} <span className="text-muted-foreground">→</span> {to}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('transfers.board.lines', { count: n })} · {t('transfers.board.qty_total', { qty: q })}
      </p>
      {row.dispatched_at ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('transfers.board.dispatched_at')}: {formatIso(String(row.dispatched_at), 'yyyy-MM-dd HH:mm')}
        </p>
      ) : null}
      {row.received_at ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('transfers.board.received_at')}: {formatIso(String(row.received_at), 'yyyy-MM-dd HH:mm')}
        </p>
      ) : null}
    </Link>
  );
}

export default function TransfersList() {
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const canUpdate = usePermission('inventory', 'update');
  const { data: rows = [], isLoading, isError, refetch } = useTransfersListQuery({ limit: 200, offset: 0 });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fromBranchId, setFromBranchId] = useState<string>('all');
  const [toBranchId, setToBranchId] = useState<string>('all');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferFormKey, setTransferFormKey] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.id} ${branchLabel(r, 'from')} ${branchLabel(r, 'to')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const d = createdDateKey(r.created_at);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (fromBranchId !== 'all' && r.from_branch_id !== Number(fromBranchId)) return false;
      if (toBranchId !== 'all' && r.to_branch_id !== Number(toBranchId)) return false;
      return true;
    });
  }, [rows, search, dateFrom, dateTo, fromBranchId, toBranchId]);

  const byStatus = useMemo(() => {
    const map: Record<string, TransferRead[]> = {
      pending_dispatch: [],
      in_transit: [],
      received: [],
    };
    for (const r of filtered) {
      if (map[r.status] != null) {
        map[r.status].push(r);
      }
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    return map;
  }, [filtered]);

  const counts = useMemo(
    () => ({
      pending_dispatch: byStatus.pending_dispatch.length,
      in_transit: byStatus.in_transit.length,
      received: byStatus.received.length,
    }),
    [byStatus],
  );

  const columns = useMemo(
    () =>
      defineColumns<TransferRead>()([
        { id: 'id', accessorKey: 'id', header: t('transfers.col.transfer_no') },
        {
          id: 'from',
          header: t('transfers.col.from'),
          cell: ({ row }) => branchLabel(row.original, 'from'),
        },
        {
          id: 'to',
          header: t('transfers.col.to'),
          cell: ({ row }) => branchLabel(row.original, 'to'),
        },
        {
          id: 'status',
          accessorKey: 'status',
          header: t('transfers.col.status'),
          cell: ({ row }) =>
            t(`transfers.status.${row.original.status}`, { defaultValue: row.original.status }),
        },
        {
          id: 'at',
          accessorKey: 'created_at',
          header: t('transfers.col.created'),
          cell: ({ row }) => formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm'),
        },
        {
          id: 'a',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to={`/inventory/transfers/${row.original.id}`}>{t('actions.open')}</Link>
            </Button>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">{tc('nav.dashboard')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="size-4 rtl:rotate-180" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/inventory/stock">{tc('nav.inventory')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="size-4 rtl:rotate-180" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>{tc('nav.inventory_transfers')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-start lg:gap-3">
        <div className="order-2 flex flex-wrap items-center gap-2 lg:order-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void refetch()}
            disabled={isLoading}
            title={t('transfers.board.refresh')}
          >
            <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
          </Button>
          {canUpdate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTransferFormKey((k) => k + 1);
                setTransferDialogOpen(true);
              }}
            >
              {t('transfers.new')}
            </Button>
          ) : null}
        </div>
        <div className="order-1 flex min-w-0 flex-1 gap-4 lg:order-2">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Truck className="size-6" />
          </div>
          <PageHeader title={t('transfers.title')} subtitle={t('transfers.subtitle')} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 sm:[direction:rtl]">
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-center sm:text-start">
          <p className="text-xs text-muted-foreground">{t('transfers.board.column_pending')}</p>
          <p className="text-xl font-semibold tabular-nums">{counts.pending_dispatch}</p>
        </div>
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-center sm:text-start">
          <p className="text-xs text-muted-foreground">{t('transfers.board.column_transit')}</p>
          <p className="text-xl font-semibold tabular-nums">{counts.in_transit}</p>
        </div>
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-center sm:text-start">
          <p className="text-xs text-muted-foreground">{t('transfers.board.column_received')}</p>
          <p className="text-xl font-semibold tabular-nums">{counts.received}</p>
        </div>
      </div>

      <Tabs defaultValue="board" className="flex flex-col gap-4">
        <TabsList className="w-full justify-start sm:w-auto">
          <TabsTrigger value="board">{t('transfers.board.tab_track')}</TabsTrigger>
          <TabsTrigger value="list">{t('transfers.board.tab_list')}</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-0 flex flex-col gap-4 outline-none">
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="lg:contents">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-2 self-start border-secondary/60 bg-background font-medium text-secondary shadow-none hover:bg-muted/50 hover:text-secondary lg:self-end"
                  >
                    <Filter className="size-4" />
                    {advancedOpen ? t('transfers.board.advanced_close') : t('transfers.board.advanced_open')}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-3 data-[state=open]:mt-3 lg:col-span-full lg:flex-row lg:flex-wrap lg:items-end lg:gap-4">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-md">
                    <div className="space-y-1">
                      <Label htmlFor="tf-from">{t('transfers.board.date_from')}</Label>
                      <Input id="tf-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tf-to">{t('transfers.board.date_to')}</Label>
                      <Input id="tf-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-40 space-y-1">
                      <Label>{t('transfers.board.filter_from')}</Label>
                      <Select value={fromBranchId} onValueChange={setFromBranchId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('transfers.board.all_branches')}</SelectItem>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-40 space-y-1">
                      <Label>{t('transfers.board.filter_to')}</Label>
                      <Select value={toBranchId} onValueChange={setToBranchId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('transfers.board.all_branches')}</SelectItem>
                          {branches.map((b) => (
                            <SelectItem key={`to-${b.id}`} value={String(b.id)}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="transfer-search" className="sr-only">
                  {t('transfers.board.search_placeholder')}
                </Label>
                <Input
                  id="transfer-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('transfers.board.search_placeholder')}
                />
              </div>
            </div>
          </div>

          {isError ? (
            <p className="text-sm text-destructive">{t('errors.generic')}</p>
          ) : isLoading ? (
            <div className="grid gap-4 md:grid-cols-3 md:[direction:rtl]">
              {[0, 1, 2].map((i) => (
                <div key={i} className="min-h-[220px] rounded-xl border bg-muted/30 p-3">
                  <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="mt-4 h-24 animate-pulse rounded-lg bg-muted" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3 md:[direction:rtl]">
              {COLUMNS.map((col) => {
                const Icon = col.icon;
                const list = byStatus[col.status];
                return (
                  <div
                    key={col.status}
                    className="flex min-h-[240px] flex-col rounded-xl border border-border/80 bg-muted/25 p-3 shadow-sm"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                      <div className={cn('flex min-w-0 items-center gap-2', col.headerClass)}>
                        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', col.iconWrapClass)}>
                          <Icon className="size-4" />
                        </span>
                        <span className="truncate text-sm font-semibold">{t(col.titleKey)}</span>
                      </div>
                      <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums shadow-sm">
                        {list.length}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      {list.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
                          <Truck className="size-10 opacity-20" />
                          <p className="text-sm">{t('transfers.board.empty')}</p>
                        </div>
                      ) : (
                        list.map((row) => <TransferBoardCard key={row.id} t={t} row={row} />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-0 outline-none">
          <DataTable
            mode="client"
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            tableDir="rtl"
          />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">{t('transfers.wavg_note')}</p>

      <FloatingFormDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        title={t('transfers.new')}
        maxWidth="lg"
      >
        {transferDialogOpen ? (
          <TransferForm
            key={transferFormKey}
            variant="dialog"
            onDismiss={() => setTransferDialogOpen(false)}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

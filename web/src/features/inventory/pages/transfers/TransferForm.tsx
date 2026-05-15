import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { BackButton } from '@/components/shared/PageHeader';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { ProductSearch } from '@/features/pos/components/ProductSearch';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { cn } from '@/lib/utils';

import {
  createTransferBatch,
  deleteTransferBatch,
  getTransferBatch,
  postDispatchTransfer,
  postReceiveTransfer,
} from '../../api';
import { inventoryKeys, stockOnHandQueryOptions } from '../../queries';
import type { StockOnHandRow } from '../../types';

function availableForProduct(rows: StockOnHandRow[], productId: number): number {
  return rows.find((r) => r.product_id === productId)?.available ?? 0;
}

function qtyAlreadyInLines(lines: { product_id: number; qty: number }[], productId: number): number {
  return lines.filter((l) => l.product_id === productId).reduce((s, l) => s + l.qty, 0);
}

function transferStatusBadgeClass(status: string): string {
  if (status === 'pending_dispatch') {
    return 'border-amber-500/60 bg-amber-500/10 text-amber-950 dark:text-amber-50';
  }
  if (status === 'in_transit') {
    return 'border-violet-500/60 bg-violet-500/10 text-violet-950 dark:text-violet-50';
  }
  if (status === 'received') {
    return 'border-emerald-500/60 bg-emerald-500/10 text-emerald-950 dark:text-emerald-50';
  }
  return 'border-border bg-muted text-muted-foreground';
}

export type TransferFormProps = {
  variant?: 'page' | 'dialog';
  onDismiss?: () => void;
};

export default function TransferForm({ variant = 'page', onDismiss }: TransferFormProps = {}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const canUpdate = usePermission('inventory', 'update');
  const actorBranchId = useAuthStore((s) => s.activeBranchId ?? s.user?.branch_id ?? null);
  const isNew = !id || id === 'new';
  const batchId = id && !isNew ? Number(id) : null;

  const { data: batch, refetch } = useQuery({
    queryKey: inventoryKeys.transfer(batchId ?? 0),
    queryFn: () => getTransferBatch(batchId!),
    enabled: batchId != null && !Number.isNaN(batchId),
  });

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [linePid, setLinePid] = useState<number | null>(null);
  const [lineQty, setLineQty] = useState('1');
  const [lines, setLines] = useState<{ product_id: number; qty: number }[]>([]);

  const fromBranchId = from ? Number(from) : NaN;
  const stockQueryEnabled = Boolean(from) && Number.isFinite(fromBranchId);
  const { data: stockRows = [], isLoading: stockLoading } = useQuery({
    ...stockOnHandQueryOptions({
      branch_id: from,
      limit: 2000,
      offset: 0,
    }),
    enabled: stockQueryEnabled,
  });

  const createM = useMutation({
    mutationFn: () =>
      createTransferBatch({
        from_branch_id: Number(from),
        to_branch_id: Number(to),
        lines,
      }),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('transfers.created'));
      if (onDismiss) {
        onDismiss();
      } else {
        navigate(`/inventory/transfers/${b.id}`);
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const disp = useMutation({
    mutationFn: () => postDispatchTransfer(batchId!),
    onSuccess: () => {
      void refetch();
      toast.success(t('transfers.dispatched'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });
  const recv = useMutation({
    mutationFn: () => postReceiveTransfer(batchId!),
    onSuccess: () => {
      void refetch();
      toast.success(t('transfers.received_ok'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const cancelM = useMutation({
    mutationFn: async () => {
      if (batchId == null || Number.isNaN(batchId)) {
        throw new Error('missing_batch');
      }
      await deleteTransferBatch(batchId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('transfers.cancelled'));
      setCancelOpen(false);
      if (onDismiss) {
        onDismiss();
      } else {
        navigate('/inventory/transfers');
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const [cancelOpen, setCancelOpen] = useState(false);

  if (isNew) {
    const shell = variant === 'dialog' ? 'max-w-lg space-y-4' : 'max-w-lg space-y-4 p-4';
    return (
      <div className={shell}>
        {variant === 'page' ? (
          <h1 className="text-2xl font-semibold tracking-tight">{t('transfers.new')}</h1>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{t('transfers.from')}</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('transfers.to')}</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Label>{t('transfers.line.product')}</Label>
            <ProductSearch
              value={linePid == null ? undefined : String(linePid)}
              onChange={(id) => setLinePid(id)}
            />
          </div>
          <div>
            <Label>{t('transfers.line.qty')}</Label>
            <Input value={lineQty} onChange={(e) => setLineQty(e.target.value)} className="w-24" type="number" min={1} />
          </div>
          <Button
            type="button"
            onClick={() => {
              if (!from) {
                toast.error(t('transfers.errors.select_from_branch'));
                return;
              }
              if (stockQueryEnabled && stockLoading) {
                toast.error(t('transfers.errors.stock_loading'));
                return;
              }
              const p = linePid;
              const q = Number(lineQty);
              if (p == null || p <= 0 || !Number.isFinite(q) || q <= 0) {
                return;
              }
              const already = qtyAlreadyInLines(lines, p);
              const avail = availableForProduct(stockRows, p);
              if (already + q > avail) {
                toast.error(
                  t('transfers.errors.insufficient_at_source', {
                    available: avail,
                    requested: already + q,
                  }),
                );
                return;
              }
              setLines([...lines, { product_id: p, qty: q }]);
              setLinePid(null);
            }}
          >
            {t('actions.add_line')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('transfers.add_line_hint')}</p>
        <ul className="text-sm">
          {lines.map((l, i) => (
            <li key={i}>
              {t('transfers.line.product')} {l.product_id} × {l.qty}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => {
              if (!from || !to || from === to || !lines.length) {
                return;
              }
              if (stockQueryEnabled && stockLoading) {
                toast.error(t('transfers.errors.stock_loading'));
                return;
              }
              const totals = new Map<number, number>();
              for (const l of lines) {
                totals.set(l.product_id, (totals.get(l.product_id) ?? 0) + l.qty);
              }
              for (const [productId, totalQty] of totals) {
                const avail = availableForProduct(stockRows, productId);
                if (totalQty > avail) {
                  toast.error(
                    t('transfers.errors.insufficient_at_source', {
                      available: avail,
                      requested: totalQty,
                    }),
                  );
                  return;
                }
              }
              void createM.mutate();
            }}
          >
            {t('actions.create')}
          </Button>
          {onDismiss ? (
            <Button type="button" variant="ghost" onClick={onDismiss}>
              {t('actions.cancel')}
            </Button>
          ) : (
            <Button type="button" variant="ghost" asChild>
              <Link to="/inventory/transfers">{t('actions.cancel')}</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (batch == null) {
    return <p className="p-4 text-muted-foreground">{t('loading')}</p>;
  }

  const fromName = batch.from_branch_name?.trim() ? batch.from_branch_name : String(batch.from_branch_id);
  const toName = batch.to_branch_name?.trim() ? batch.to_branch_name : String(batch.to_branch_id);
  const batchLines = batch.lines ?? [];
  const totalUnits = batchLines.reduce((a, l) => a + l.qty, 0);
  const lineCount = batchLines.length;
  const statusLabel = t(`transfers.status.${batch.status}`, { defaultValue: batch.status });
  const branchAllowsDispatch = actorBranchId == null || actorBranchId === batch.from_branch_id;
  const branchAllowsReceive = actorBranchId == null || actorBranchId === batch.to_branch_id;
  const showDispatch = canUpdate && batch.status === 'pending_dispatch' && branchAllowsDispatch;
  const showReceive = canUpdate && batch.status === 'in_transit' && branchAllowsReceive;
  const showCancel = canUpdate && batch.status === 'pending_dispatch' && branchAllowsDispatch;
  const creatorDisplay = batch.created_by_user_name?.trim() || null;
  const showRoleHintCard = batch.status !== 'received';
  const roleHintSingle =
    batch.status === 'pending_dispatch'
      ? t('transfers.detail.dispatch_branch_hint')
      : batch.status === 'in_transit'
        ? t('transfers.detail.receive_branch_hint')
        : t('transfers.detail.dispatch_branch_hint');

  const detailShell =
    variant === 'dialog' ? 'mx-auto max-w-6xl space-y-6' : 'mx-auto max-w-6xl space-y-6 p-4 sm:p-6';

  return (
    <div className={detailShell}>
      <div className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('transfers.detail.title', { id: batch.id })}</h1>
          <Badge variant="outline" className={cn('font-medium', transferStatusBadgeClass(batch.status))}>
            {statusLabel}
          </Badge>
        </div>
        {variant === 'page' ? (
          <div className="shrink-0">
            <BackButton to="/inventory/transfers" label={t('actions.back')} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <Card className="flex min-h-0 flex-col border-2 border-border/80 shadow-sm">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-lg">{t('transfers.detail.route_title')}</CardTitle>
            <CardDescription>{t('transfers.detail.cost_note')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-6">
            <div className="flex flex-col items-stretch gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{t('transfers.from')}</p>
                <p className="mt-1 text-base font-semibold leading-snug">{fromName}</p>
              </div>
              <ChevronRight className="mx-auto size-6 shrink-0 text-muted-foreground rtl:rotate-180 sm:mx-0" aria-hidden />
              <div className="min-w-0 flex-1 sm:text-end">
                <p className="text-xs font-medium text-muted-foreground">{t('transfers.to')}</p>
                <p className="mt-1 text-base font-semibold leading-snug">{toName}</p>
              </div>
            </div>

            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              {/* RTL: first cell = top-right; LTR: first cell = top-left — same logical order */}
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_creator')}</p>
                <p className="mt-1 text-sm font-medium">{creatorDisplay ?? '—'}</p>
              </div>
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs text-muted-foreground">{t('transfers.detail.totals')}</p>
                <p className="mt-1 text-sm font-medium tabular-nums">{totalUnits}</p>
              </div>
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs text-muted-foreground">{t('transfers.detail.line_count')}</p>
                <p className="mt-1 text-sm font-medium tabular-nums">{lineCount}</p>
              </div>
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_created')}</p>
                <p className="mt-1 text-sm font-medium num-latin">
                  {formatIso(String(batch.created_at), 'yyyy-MM-dd HH:mm')}
                </p>
              </div>
              {batch.dispatched_at ? (
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_dispatched')}</p>
                  <p className="mt-1 text-sm font-medium num-latin">
                    {formatIso(String(batch.dispatched_at), 'yyyy-MM-dd HH:mm')}
                  </p>
                </div>
              ) : null}
              {batch.received_at ? (
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_received')}</p>
                  <p className="mt-1 text-sm font-medium num-latin">
                    {formatIso(String(batch.received_at), 'yyyy-MM-dd HH:mm')}
                  </p>
                </div>
              ) : null}
              <div
                className={cn(
                  'rounded-md border bg-card p-3',
                  batch.received_at ? 'sm:col-span-2' : null,
                )}
              >
                <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_updated')}</p>
                <p className="mt-1 text-sm font-medium num-latin">
                  {formatIso(String(batch.updated_at), 'yyyy-MM-dd HH:mm')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col border-2 border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Package className="size-5 text-muted-foreground" aria-hidden />
              <CardTitle className="text-lg">{t('transfers.detail.lines_title')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>{t('transfers.line.product')}</TableHead>
                  <TableHead className="w-28 text-end">{t('transfers.line.qty')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchLines.map((ln) => (
                  <TableRow key={ln.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground num-latin">{ln.id}</TableCell>
                    <TableCell className="font-medium">
                      {ln.product_name && ln.product_name.length > 0
                        ? ln.product_name
                        : `${t('transfers.line.product')} ${ln.product_id}`}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{ln.qty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {showRoleHintCard ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>{roleHintSingle}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {showCancel ? (
            <Button
              type="button"
              variant="outline"
              disabled={cancelM.isPending}
              onClick={() => setCancelOpen(true)}
            >
              {t('transfers.cancel')}
            </Button>
          ) : null}
          {showDispatch ? (
            <Button type="button" disabled={disp.isPending} onClick={() => void disp.mutate()}>
              {t('transfers.dispatch')}
            </Button>
          ) : null}
          {showReceive ? (
            <Button type="button" disabled={recv.isPending} onClick={() => void recv.mutate()}>
              {t('transfers.receive')}
            </Button>
          ) : null}
          {onDismiss ? (
            <Button type="button" variant="outline" onClick={onDismiss}>
              {t('actions.back')}
            </Button>
          ) : null}
        </div>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transfers.cancel_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('transfers.cancel_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelM.isPending}
              onClick={() => void cancelM.mutate()}
            >
              {cancelM.isPending ? t('transfers.cancel_pending') : t('transfers.cancel_confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

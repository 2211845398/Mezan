import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardEdit, FileDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';

import {
  cancelStockCountSession,
  downloadStockCountSessionPdf,
  listStockCountSessions,
  type StockCountSessionRead,
} from '../../api';
import { StockCountBranchFilter } from '../../components/StockCountBranchFilter';
import { StockCountIssueDialog } from '../../components/StockCountIssueDialog';
import { inventoryKeys } from '../../queries';

function statusLabel(status: string, t: (k: string) => string): string {
  const key = `movement.stock_count.status_${status}`;
  const label = t(key);
  return label === key ? status : label;
}

function isCancellable(status: string): boolean {
  return status === 'draft' || status === 'in_progress';
}

export default function StockCountPage() {
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canIssue = usePermission('inventory', 'update');

  const [branchFilter, setBranchFilter] = useState<number | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<StockCountSessionRead | null>(null);

  const { data: sessions = [], isLoading, isError, refetch } = useQuery({
    queryKey: [...inventoryKeys.root, 'stock-count-sessions', branchFilter],
    queryFn: () => {
      const params: { limit: number; branch_id?: number } = { limit: 200 };
      if (branchFilter != null) {
        params.branch_id = branchFilter;
      }
      return listStockCountSessions(params);
    },
  });

  const pdfM = useMutation({
    mutationFn: (sessionId: number) => downloadStockCountSessionPdf(sessionId),
    onSuccess: (filename) => {
      toast.success(t('movement.stock_count.exported', { filename }));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const cancelM = useMutation({
    mutationFn: (sessionId: number) => cancelStockCountSession(sessionId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      setCancelTarget(null);
      toast.success(t('movement.stock_count.cancelled'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const columns = defineColumns<StockCountSessionRead>()([
    {
      id: 'version',
      header: t('movement.stock_count.col_version'),
      cell: ({ row }) => (
        <span className="tabular-nums num-latin font-medium">v{row.original.version_no}</span>
      ),
    },
    { id: 'branch', header: t('movement.stock_count.col_branch'), accessorKey: 'branch_name' },
    {
      id: 'date',
      header: t('movement.stock_count.col_date'),
      cell: ({ row }) =>
        row.original.created_at ? formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm') : '—',
    },
    { id: 'responsible', header: t('movement.stock_count.col_responsible'), accessorKey: 'responsible_name' },
    {
      id: 'status',
      header: t('movement.stock_count.col_status'),
      cell: ({ row }) => {
        const status = row.original.status;
        const badgeStatus =
          status === 'posted' ? 'closed' : status === 'cancelled' ? 'cancelled' : status;
        return <StatusBadge status={badgeStatus} label={statusLabel(status, t)} />;
      },
    },
    { id: 'lines', header: t('movement.stock_count.col_lines'), accessorKey: 'line_count' },
    {
      id: 'pdf',
      header: '',
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pdfM.isPending}
          onClick={() => void pdfM.mutate(row.original.id)}
          title={t('movement.stock_count.download_pdf')}
        >
          <FileDown className="size-4" />
        </Button>
      ),
    },
    {
      id: 'fill',
      header: '',
      cell: ({ row }) =>
        isCancellable(row.original.status) ? (
          <Button type="button" size="sm" variant="outline" asChild>
            <Link to={`/inventory/stock-count/${row.original.id}`}>
              <ClipboardEdit className="me-1 size-4" />
              {t('movement.stock_count.fill')}
            </Link>
          </Button>
        ) : null,
    },
    {
      id: 'cancel',
      header: '',
      cell: ({ row }) =>
        canIssue && isCancellable(row.original.status) ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={cancelM.isPending}
            onClick={() => setCancelTarget(row.original)}
          >
            {tc('actions.cancel')}
          </Button>
        ) : null,
    },
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('movement.stock_count.list_title')}
        actions={
          <div className="flex flex-wrap gap-2">
            {canIssue ? (
              <Button type="button" size="sm" onClick={() => setIssueOpen(true)}>
                {t('movement.stock_count.issue')}
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/inventory/stock')}>
              {tc('actions.back')}
            </Button>
          </div>
        }
      />

      <DataTable
        mode="client"
        showSearch={false}
        toolbarLeading={
          <StockCountBranchFilter value={branchFilter} onChange={setBranchFilter} />
        }
        columns={columns}
        data={sessions}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        getRowId={(r) => String(r.id)}
      />

      {canIssue ? <StockCountIssueDialog open={issueOpen} onOpenChange={setIssueOpen} /> : null}

      <AlertDialog open={cancelTarget != null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('movement.stock_count.cancel_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('movement.stock_count.cancel_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelM.isPending || cancelTarget == null}
              onClick={() => {
                if (cancelTarget == null) return;
                void cancelM.mutate(cancelTarget.id);
              }}
            >
              {cancelM.isPending ? t('movement.stock_count.cancel_pending') : t('movement.stock_count.cancel_confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

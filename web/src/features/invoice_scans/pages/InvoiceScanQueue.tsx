import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { paginatedParams } from '@/api/pagination';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
import { Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FileDrop } from '@/components/shared/FileDrop';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';

import type { InvoiceScanRead } from '../api';
import { postInvoiceScan } from '../api';
import { invoiceScanKeys, invoiceScansListQueryOptions } from '../queries';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });
}

function mapStatus(scan: InvoiceScanRead, t: (k: string) => string): string {
  if (scan.status === 'validated') return t('map_ui.validated');
  if (scan.status === 'failed') return t('map_ui.failed');
  if (scan.status === 'needs_review') return t('map_ui.needs_review');
  if (scan.status === 'parsed') return t('status.parsed');
  if (scan.status === 'received') return t('status.received');
  return scan.status;
}

export default function InvoiceScanQueue() {
  const { t } = useTranslation('invoiceScans');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canValidate = usePermission('invoice_scans', 'validate');
  const canCreate = usePermission('invoice_scans', 'create');
  const [status, setStatus] = useState<string>(canValidate ? 'needs_review' : 'all');
  const statusParam = status === 'all' ? undefined : status;
  const [openUpload, setOpenUpload] = useState(false);

  const [urlQuery] = useTableUrlState({ pageSize: 20 });
  const { limit, offset } = paginatedParams(urlQuery.page, urlQuery.pageSize);

  const { data, isLoading, isError, refetch } = useQuery(
    invoiceScansListQueryOptions({
      limit,
      offset,
      ...(statusParam ? { status: statusParam } : {}),
    }),
  );
  const rows = data?.items ?? [];
  const totalRows = data?.total ?? 0;

  const createScan = useMutation({
    mutationFn: async (file: File) => {
      const data = await readFileAsDataUrl(file);
      return postInvoiceScan({ source_type: 'image', data, provider: 'basic' });
    },
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: invoiceScanKeys.root });
      toast.success(t('detail.reuploaded'));
      setOpenUpload(false);
      navigate(`/purchasing/invoice-match/${s.id}`);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const columns = useMemo(
    () =>
      defineColumns<InvoiceScanRead>()([
        { id: 'id', accessorKey: 'id', header: t('queue.col.id') },
        {
          id: 'status',
          header: t('queue.col.status'),
          cell: ({ row }) => (
            <span className="rounded border px-1.5 py-0.5 text-xs font-medium">
              {mapStatus(row.original, t)}
            </span>
          ),
        },
        { id: 'src', accessorKey: 'source_type', header: t('queue.col.source') },
        { id: 'prov', accessorKey: 'provider', header: t('queue.col.provider') },
        {
          id: 'at',
          accessorKey: 'created_at',
          header: t('queue.col.created'),
          cell: ({ row }) => formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm'),
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="icon" variant="ghost" asChild>
              <Link
                to={`/purchasing/invoice-match/${row.original.id}`}
                aria-label={t('queue.review')}
              >
                <Eye className="size-4" />
              </Link>
            </Button>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('queue.title')}</h1>
        {canCreate ? (
          <>
            <Button type="button" onClick={() => setOpenUpload(true)}>
              {t('queue.new_document', 'رفع إيصال / فاتورة')}
            </Button>
            <FloatingFormDialog
              open={openUpload}
              onOpenChange={setOpenUpload}
              title={t('queue.new_document', 'رفع إيصال / فاتورة')}
              maxWidth="lg"
            >
              {openUpload ? (
                <div className="flex min-h-[200px] flex-col gap-3">
                  <FileDrop
                    accept="image/*"
                    onFile={(f) => void createScan.mutate(f)}
                    disabled={createScan.isPending}
                    className="min-h-[180px]"
                  />
                  {createScan.isPending ? (
                    <p className="text-center text-sm text-muted-foreground">{t('queue.uploading', 'جارٍ الرفع...')}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{t('queue.upload_hint')}</p>
                </div>
              ) : null}
            </FloatingFormDialog>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label className="shrink-0">{t('queue.filter_status')}</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="needs_review">{t('map_ui.needs_review')}</SelectItem>
            <SelectItem value="validated">{t('map_ui.validated')}</SelectItem>
            <SelectItem value="failed">{t('map_ui.failed')}</SelectItem>
            <SelectItem value="all">{t('queue.all_statuses')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        mode="server"
        columns={columns}
        data={rows}
        totalRows={totalRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}

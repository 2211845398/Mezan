import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FileDrop } from '@/components/shared/FileDrop';
import { floatingFormCloseButtonSmClassName,FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type InvoiceScanRead,postInvoiceScan } from '@/features/invoice_scans/api';
import { invoiceScanKeys, invoiceScansListQueryOptions } from '@/features/invoice_scans/queries';
import { formatIso } from '@/lib/date';
import { cn } from '@/lib/utils';

const DISMISSED_STORAGE_KEY = 'mezan_invoice_scan_dismissed_ids';

function readDismissedIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is number => typeof x === 'number'));
  } catch {
    return new Set();
  }
}

function writeDismissedIds(ids: Set<number>) {
  sessionStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...ids]));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });
}

const primaryGreenButtonClass = cn(
  'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
);

/** Green button + floating upload dialog (invoice scan). */
export function PurchasingInvoiceScanUploadButton() {
  const { t } = useTranslation('purchasing');
  const { t: tInv } = useTranslation('invoiceScans');
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = await readFileAsDataUrl(file);
      return postInvoiceScan({ source_type: 'image', data, provider: 'basic' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: invoiceScanKeys.root });
      toast.success(t('document_intake.upload_success'));
      setOpen(false);
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <>
      <Button
        type="button"
        className={cn(primaryGreenButtonClass)}
        onClick={() => setOpen(true)}
      >
        <FileText className="me-2 size-4 shrink-0" aria-hidden />
        {t('document_intake.upload_document')}
      </Button>
      <FloatingFormDialog
        open={open}
        onOpenChange={setOpen}
        title={t('document_intake.dialog_title')}
        description={t('document_intake.dialog_description')}
        maxWidth="lg"
        footer={
          <Button
            type="button"
            variant="outline"
            className={floatingFormCloseButtonSmClassName}
            onClick={() => setOpen(false)}
            disabled={upload.isPending}
          >
            {t('document_intake.close')}
          </Button>
        }
      >
        <div className="flex min-h-[200px] flex-col gap-3">
          <FileDrop
            accept="image/*"
            disabled={upload.isPending}
            onFile={(f) => void upload.mutate(f)}
            aria-label={t('document_intake.upload_document')}
            className="min-h-[180px]"
          />
          {upload.isPending ? (
            <p className="text-center text-sm text-muted-foreground">{t('document_intake.uploading')}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">{tInv('queue.upload_hint')}</p>
        </div>
      </FloatingFormDialog>
    </>
  );
}

/** Table of invoice scans in needs_review, minus session-dismissed rows. */
export function PurchasingPendingInvoiceScansSection() {
  const { t } = useTranslation('purchasing');
  const { t: tInv } = useTranslation('invoiceScans');
  const [dismissed, setDismissed] = useState<Set<number>>(readDismissedIds);

  const { data, isLoading, isError, refetch } = useQuery(
    invoiceScansListQueryOptions({ status: 'needs_review', limit: 50, offset: 0 }),
  );
  const rows = data?.items ?? [];

  const visible = useMemo(
    () => rows.filter((r) => !dismissed.has(r.id)).sort((a, b) => b.id - a.id),
    [rows, dismissed],
  );

  const dismiss = useCallback((id: number) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissedIds(next);
      return next;
    });
    toast.info(t('document_intake.reject_toast'));
  }, [t]);

  const columns = useMemo(
    () =>
      defineColumns<InvoiceScanRead>()([
        { id: 'id', accessorKey: 'id', header: t('document_intake.col_id') },
        {
          id: 'created',
          accessorKey: 'created_at',
          header: t('document_intake.col_created'),
          cell: ({ row }) => formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm'),
        },
        {
          id: 'status',
          header: t('document_intake.col_status'),
          cell: () => (
            <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              {tInv('map_ui.needs_review')}
            </span>
          ),
        },
        {
          id: 'actions',
          header: t('document_intake.col_actions'),
          cell: ({ row }) => (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" className={primaryGreenButtonClass} asChild>
                <Link to={`/purchasing/invoice-match/${row.original.id}`}>{t('document_intake.review_action')}</Link>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => dismiss(row.original.id)}>
                {t('document_intake.reject')}
              </Button>
            </div>
          ),
        },
      ]),
    [dismiss, t, tInv],
  );

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('document_intake.pending_title')}</CardTitle>
        <CardDescription>{t('document_intake.approve_hint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          mode="client"
          columns={columns}
          data={visible}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          emptyState={<p className="py-6 text-center text-sm text-muted-foreground">{t('document_intake.pending_empty')}</p>}
        />
      </CardContent>
    </Card>
  );
}

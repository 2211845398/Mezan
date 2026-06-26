import { useMutation, useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { ReportExportButtons } from '@/components/shared/ReportExportButtons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getSalesInvoice } from '@/features/pos/api';
import { invoiceKeys } from '@/features/pos/queries';
import {
  exportSalesInvoicePdfBlob,
  exportSalesInvoiceXlsxBlob,
} from '@/features/marketing/api';
import { downloadBlob } from '@/lib/downloadBlob';
import { isValidInvoicePkId } from '@/lib/salesInvoiceId';

import { A4InvoiceDocument } from './A4InvoiceDocument';
import { a4ModelFromInvoiceDetail } from './a4InvoiceModel';

export type A4InvoicePrintDialogProps = {
  invoiceId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function A4InvoicePrintDialog({ invoiceId, open, onOpenChange }: A4InvoicePrintDialogProps) {
  const { t } = useTranslation('pos');
  const { t: tc } = useTranslation('common');
  const printRef = useRef<HTMLDivElement>(null);
  const print = useReactToPrint({ contentRef: printRef });

  const validInvoiceId =
    invoiceId != null && isValidInvoicePkId(invoiceId) ? invoiceId : null;

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: invoiceKeys.detail(validInvoiceId ?? 0),
    queryFn: () => getSalesInvoice(validInvoiceId!),
    enabled: open && validInvoiceId != null,
  });

  const invalidId = open && invoiceId != null && validInvoiceId == null;

  const exportPdf = useMutation({
    mutationFn: () => exportSalesInvoicePdfBlob(validInvoiceId!),
    onSuccess: (blob) => {
      downloadBlob(blob, `invoice-${invoiceId}.pdf`);
      toast.success(tc('export.pdf_ok'));
    },
    onError: (error) => notifyApiError(error, t('print.a4.load_error')),
  });

  const exportExcel = useMutation({
    mutationFn: () => exportSalesInvoiceXlsxBlob(validInvoiceId!),
    onSuccess: (blob) => {
      downloadBlob(blob, `invoice-${invoiceId}.xlsx`);
      toast.success(tc('export.excel_ok'));
    },
    onError: (error) => notifyApiError(error, t('print.a4.load_error')),
  });

  const model = useMemo(() => (invoice ? a4ModelFromInvoiceDetail(invoice) : null), [invoice]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('print.a4.dialog_title')}</DialogTitle>
        </DialogHeader>
        {invalidId ? (
          <p className="text-sm text-destructive">{t('print.a4.invalid_id')}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : isError || !model ? (
          <p className="text-sm text-destructive">{t('print.a4.load_error')}</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/20 p-4">
            <A4InvoiceDocument model={model} />
          </div>
        )}
        <div
          className="pointer-events-none fixed -left-[10000px] top-0 h-0 w-0 overflow-hidden"
          aria-hidden="true"
        >
          {model ? <A4InvoiceDocument ref={printRef} model={model} /> : null}
        </div>
        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {validInvoiceId != null ? (
            <ReportExportButtons
              disabled={!model}
              pdfPending={exportPdf.isPending}
              excelPending={exportExcel.isPending}
              onExportPdf={() => exportPdf.mutate()}
              onExportExcel={() => exportExcel.mutate()}
            />
          ) : null}
          <div className="flex gap-2 sm:ms-auto">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('receipt.close')}
            </Button>
            <Button type="button" disabled={!model} onClick={() => void print()}>
              <Printer className="me-2 size-4" aria-hidden />
              {t('print.a4.print')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type A4InvoicePrintButtonProps = {
  invoiceId: number;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
};

export function A4InvoicePrintButton({
  invoiceId,
  variant = 'outline',
  size = 'sm',
  className,
}: A4InvoicePrintButtonProps) {
  const { t } = useTranslation('pos');
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    if (!isValidInvoicePkId(invoiceId)) {
      toast.error(t('print.a4.invalid_id'));
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={handleOpen}
      >
        <Printer className="me-1.5 size-4" aria-hidden />
        {t('print.a4.button')}
      </Button>
      <A4InvoicePrintDialog invoiceId={invoiceId} open={open} onOpenChange={setOpen} />
    </>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactToPrint } from 'react-to-print';

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

import { A4InvoiceDocument } from './A4InvoiceDocument';
import { a4ModelFromInvoiceDetail } from './a4InvoiceModel';

export type A4InvoicePrintDialogProps = {
  invoiceId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function A4InvoicePrintDialog({ invoiceId, open, onOpenChange }: A4InvoicePrintDialogProps) {
  const { t } = useTranslation('pos');
  const printRef = useRef<HTMLDivElement>(null);
  const print = useReactToPrint({ contentRef: printRef });

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: invoiceKeys.detail(invoiceId ?? 0),
    queryFn: () => getSalesInvoice(invoiceId!),
    enabled: open && invoiceId != null && invoiceId > 0,
  });

  const model = useMemo(() => (invoice ? a4ModelFromInvoiceDetail(invoice) : null), [invoice]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('print.a4.dialog_title')}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('receipt.close')}
          </Button>
          <Button type="button" disabled={!model} onClick={() => void print()}>
            <Printer className="me-2 size-4" aria-hidden />
            {t('print.a4.print')}
          </Button>
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

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Printer className="me-1.5 size-4" aria-hidden />
        {t('print.a4.button')}
      </Button>
      <A4InvoicePrintDialog invoiceId={invoiceId} open={open} onOpenChange={setOpen} />
    </>
  );
}

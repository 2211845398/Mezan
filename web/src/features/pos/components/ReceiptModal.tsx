import { useRef } from 'react';
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

import { ThermalReceipt58 } from '../print/ThermalReceipt58';
import { ThermalReceipt80 } from '../print/ThermalReceipt80';
import { ThermalReceiptInner } from '../print/ThermalReceiptInner';
import type { ThermalReceiptModel } from '../print/types';

export type ReceiptModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ThermalReceiptModel;
  /** When set, render return / credit note headers. */
  creditMode?: boolean;
};

export function ReceiptModal({ open, onOpenChange, model, creditMode }: ReceiptModalProps) {
  const { t } = useTranslation('pos');
  const ref58 = useRef<HTMLDivElement>(null);
  const ref80 = useRef<HTMLDivElement>(null);

  const print58 = useReactToPrint({ contentRef: ref58 });
  const print80 = useReactToPrint({ contentRef: ref80 });

  const printModel: ThermalReceiptModel = creditMode ? { ...model, isReturn: true } : model;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('receipt.title')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto rounded-md border bg-muted/20 p-3">
          <div className="w-[80mm]">
            <ThermalReceiptInner model={printModel} />
          </div>
        </div>
        <div
          className="pointer-events-none fixed -left-[10000px] top-0 h-0 w-0 overflow-hidden"
          aria-hidden="true"
        >
          <ThermalReceipt58 ref={ref58} model={printModel} />
          <ThermalReceipt80 ref={ref80} model={printModel} />
        </div>
        <DialogFooter className="flex flex-wrap items-center justify-end gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => void print58()}>
            {t('receipt.print_58')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void print80()}>
            {t('receipt.print_80')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-destructive bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onOpenChange(false)}
          >
            {t('receipt.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

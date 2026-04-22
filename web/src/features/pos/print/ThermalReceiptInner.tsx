import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@/lib/format';

import type { ThermalReceiptModel } from './types';

function money(n: string, currency: string): string {
  const v = Number.parseFloat(n);
  if (!Number.isFinite(v)) return n;
  return formatCurrency(v, currency);
}

export function ThermalReceiptInner({ model }: { model: ThermalReceiptModel }) {
  const { t } = useTranslation('pos');

  const title = model.isReturn
    ? t('receipt.return_header')
    : model.creditNumber
      ? t('receipt.credit_note')
      : t('receipt.sale_header');

  return (
    <div className="space-y-1 text-xs leading-snug">
      {model.provisionalWatermark ? (
        <div className="border border-dashed border-foreground/50 p-1 text-center font-semibold">
          {t('receipt.provisional', { code: model.provisionalWatermark })}
        </div>
      ) : null}
      <div className="text-center font-bold">{title}</div>
      <div className="text-center text-[10px] text-muted-foreground">{model.branchLabel}</div>
      {model.invoiceNumber ? (
        <div className="text-center">
          {t('receipt.invoice_no')}: {model.invoiceNumber}
        </div>
      ) : null}
      {model.creditNumber ? (
        <div className="text-center">
          {t('receipt.credit_no')}: {model.creditNumber}
        </div>
      ) : null}
      <div className="text-center text-[10px]">{model.createdAtLabel}</div>
      <hr className="border-foreground/20" />
      <div className="space-y-1">
        {model.lines.map((ln, i) => (
          <div key={`${ln.name}-${i}`} className="grid grid-cols-[1fr_auto] gap-x-2">
            <div>
              <div className="font-medium">{ln.name}</div>
              <div className="text-[10px] text-muted-foreground">
                ×{ln.qty} @ {money(ln.unitPrice, model.currency)} | {t('receipt.vat')}{' '}
                {money(ln.taxAmount, model.currency)}
              </div>
            </div>
            <div className="text-start font-medium">{money(ln.lineTotal, model.currency)}</div>
          </div>
        ))}
      </div>
      <hr className="border-foreground/20" />
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between gap-2">
          <span>{t('register.subtotal')}</span>
          <span dir="ltr">{money(model.subtotal, model.currency)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>{t('register.discount')}</span>
          <span dir="ltr">{money(model.discountTotal, model.currency)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>{t('register.tax')}</span>
          <span dir="ltr">{money(model.taxTotal, model.currency)}</span>
        </div>
        <div className="flex justify-between gap-2 font-bold">
          <span>{t('register.total')}</span>
          <span dir="ltr">{money(model.total, model.currency)}</span>
        </div>
        {model.paymentMethod ? (
          <div className="flex justify-between gap-2">
            <span>{t('tender.method')}</span>
            <span>{model.paymentMethod}</span>
          </div>
        ) : null}
        {model.tendered != null && model.tendered !== '' ? (
          <div className="flex justify-between gap-2">
            <span>{t('tender.tendered')}</span>
            <span dir="ltr">{money(model.tendered, model.currency)}</span>
          </div>
        ) : null}
        {model.changeDue != null && model.changeDue !== '' ? (
          <div className="flex justify-between gap-2">
            <span>{t('tender.change')}</span>
            <span dir="ltr">{money(model.changeDue, model.currency)}</span>
          </div>
        ) : null}
      </div>
      <hr className="border-foreground/20" />
      <div className="text-center text-[10px] text-muted-foreground">{t('receipt.thanks')}</div>
    </div>
  );
}

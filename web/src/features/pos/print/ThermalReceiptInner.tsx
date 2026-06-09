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
      <table className="w-full table-fixed border-collapse text-[9px] leading-tight">
        <colgroup>
          <col className="w-[36%]" />
          <col className="w-[24%]" />
          <col className="w-[14%]" />
          <col className="w-[26%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-foreground/25">
            <th scope="col" className="px-0.5 py-1 text-start align-bottom font-semibold">
              {t('receipt.col_item')}
            </th>
            <th scope="col" className="px-0.5 py-1 text-end align-bottom font-semibold">
              {t('receipt.col_unit')}
            </th>
            <th scope="col" className="px-0.5 py-1 text-center align-bottom font-semibold">
              {t('receipt.col_qty')}
            </th>
            <th scope="col" className="px-0.5 py-1 text-end align-bottom font-semibold">
              {t('receipt.col_line_total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {model.lines.map((ln, i) => (
            <tr key={`${ln.name}-${i}`} className="border-b border-foreground/10">
              <td className="break-words px-0.5 py-1 align-top font-medium">
                {ln.name}
                {Number.parseFloat(ln.taxAmount) > 0 ? (
                  <span className="mt-0.5 block text-[8px] font-normal text-muted-foreground">
                    {t('receipt.vat')} {money(ln.taxAmount, model.currency)}
                  </span>
                ) : null}
              </td>
              <td className="px-0.5 py-1 align-top text-end tabular-nums" dir="ltr">
                {money(ln.unitPrice, model.currency)}
              </td>
              <td className="px-0.5 py-1 align-top text-center tabular-nums">{ln.qty}</td>
              <td className="px-0.5 py-1 align-top text-end font-medium tabular-nums" dir="ltr">
                {money(ln.lineTotal, model.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        {model.roundingDifference != null &&
        model.roundingDifference !== '' &&
        model.roundingDifference !== '0' &&
        model.roundingDifference !== '0.00' ? (
          <div className="flex justify-between gap-2">
            <span>{t('tender.rounding_difference')}</span>
            <span dir="ltr">{money(model.roundingDifference, model.currency)}</span>
          </div>
        ) : null}
        {model.amountPaid != null && model.amountPaid !== '' ? (
          <div className="flex justify-between gap-2 font-bold">
            <span>{t('tender.amount_paid')}</span>
            <span dir="ltr">{money(model.amountPaid, model.currency)}</span>
          </div>
        ) : null}
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
        {model.changeDue != null && model.changeDue !== '' && model.changeDue !== '0' ? (
          <div className="flex justify-between gap-2">
            <span>{t('tender.change')}</span>
            <span dir="ltr">{money(model.changeDue, model.currency)}</span>
          </div>
        ) : null}
        {model.remaining != null && model.remaining !== '' && model.remaining !== '0' ? (
          <div className="flex justify-between gap-2 font-semibold">
            <span>{t('tender.remaining')}</span>
            <span dir="ltr">{money(model.remaining, model.currency)}</span>
          </div>
        ) : null}
      </div>
      <hr className="border-foreground/20" />
      <div className="text-center text-[10px] text-muted-foreground">{t('receipt.thanks')}</div>
    </div>
  );
}

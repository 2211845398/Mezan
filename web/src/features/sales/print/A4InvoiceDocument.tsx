import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@/lib/format';

import type { A4InvoiceModel } from './a4InvoiceModel';

export type A4InvoiceDocumentProps = {
  model: A4InvoiceModel;
};

export const A4InvoiceDocument = forwardRef<HTMLDivElement, A4InvoiceDocumentProps>(
  function A4InvoiceDocument({ model }, ref) {
    const { t, i18n } = useTranslation('pos');
    const cur = model.currency;

    return (
      <div
        ref={ref}
        dir={i18n.dir()}
        className="box-border w-[210mm] max-w-full bg-white p-8 text-black print:w-full print:max-w-none [&_*]:text-black"
      >
        <header className="mb-6 border-b border-neutral-800 pb-4">
          <h1 className="text-2xl font-bold">{model.companyName || model.branchName}</h1>
          {model.branchName && model.companyName !== model.branchName ? (
            <p className="mt-1 text-sm text-neutral-700">{model.branchName}</p>
          ) : null}
          <p className="mt-3 text-lg font-semibold">{t('print.a4.title')}</p>
          {model.voided ? (
            <p className="mt-2 text-sm font-bold text-red-700">{t('print.a4.voided')}</p>
          ) : null}
        </header>

        <table className="mb-6 w-full border-collapse border border-neutral-800 text-sm">
          <tbody>
            <tr>
              <th className="w-1/3 border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('print.a4.invoice_no')}
              </th>
              <td className="border border-neutral-800 px-3 py-2 tabular-nums" dir="ltr">
                {model.invoiceNumber}
              </td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('print.a4.date')}
              </th>
              <td className="border border-neutral-800 px-3 py-2 tabular-nums" dir="ltr">
                {model.createdAtLabel}
              </td>
            </tr>
            {model.customerDisplay ? (
              <tr>
                <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                  {t('print.a4.customer')}
                </th>
                <td className="border border-neutral-800 px-3 py-2">{model.customerDisplay}</td>
              </tr>
            ) : null}
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('print.a4.barcode')}
              </th>
              <td className="border border-neutral-800 px-3 py-2 font-mono text-xs" dir="ltr">
                {model.invoiceBarcode}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="mb-6 w-full border-collapse border border-neutral-800 text-sm">
          <thead>
            <tr className="bg-neutral-100">
              <th className="border border-neutral-800 px-2 py-2 text-start">{t('print.a4.col.sku')}</th>
              <th className="border border-neutral-800 px-2 py-2 text-start">{t('print.a4.col.description')}</th>
              <th className="border border-neutral-800 px-2 py-2 text-end">{t('print.a4.col.qty')}</th>
              <th className="border border-neutral-800 px-2 py-2 text-end">{t('print.a4.col.unit_price')}</th>
              <th className="border border-neutral-800 px-2 py-2 text-end">{t('print.a4.col.tax')}</th>
              <th className="border border-neutral-800 px-2 py-2 text-end">{t('print.a4.col.line_total')}</th>
            </tr>
          </thead>
          <tbody>
            {model.lines.map((ln, i) => (
              <tr key={`${ln.sku}-${i}`}>
                <td className="border border-neutral-800 px-2 py-1.5 font-mono text-xs" dir="ltr">
                  {ln.sku}
                </td>
                <td className="border border-neutral-800 px-2 py-1.5">{ln.description}</td>
                <td className="border border-neutral-800 px-2 py-1.5 text-end tabular-nums">{ln.qty}</td>
                <td className="border border-neutral-800 px-2 py-1.5 text-end tabular-nums" dir="ltr">
                  {formatCurrency(ln.unitPrice, cur)}
                </td>
                <td className="border border-neutral-800 px-2 py-1.5 text-end tabular-nums" dir="ltr">
                  {formatCurrency(ln.taxAmount, cur)}
                </td>
                <td className="border border-neutral-800 px-2 py-1.5 text-end tabular-nums" dir="ltr">
                  {formatCurrency(ln.lineTotal, cur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="ms-auto w-full max-w-sm border-collapse border border-neutral-800 text-sm">
          <tbody>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start">
                {t('print.a4.subtotal')}
              </th>
              <td className="border border-neutral-800 px-3 py-2 text-end tabular-nums" dir="ltr">
                {formatCurrency(model.subtotal, cur)}
              </td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start">
                {t('print.a4.discount')}
              </th>
              <td className="border border-neutral-800 px-3 py-2 text-end tabular-nums" dir="ltr">
                {formatCurrency(model.discountTotal, cur)}
              </td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start">
                {t('print.a4.tax')}
              </th>
              <td className="border border-neutral-800 px-3 py-2 text-end tabular-nums" dir="ltr">
                {formatCurrency(model.taxTotal, cur)}
              </td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-bold">
                {t('print.a4.total')}
              </th>
              <td className="border border-neutral-800 px-3 py-2 text-end text-base font-bold tabular-nums" dir="ltr">
                {formatCurrency(model.total, cur)}
              </td>
            </tr>
            {model.paymentMethod ? (
              <tr>
                <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start">
                  {t('print.a4.payment')}
                </th>
                <td className="border border-neutral-800 px-3 py-2 text-end">{model.paymentMethod}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {model.voided && model.voidReason ? (
          <p className="mt-6 text-sm text-neutral-700">
            {t('print.a4.void_reason', { reason: model.voidReason })}
          </p>
        ) : null}

        <footer className="mt-10 border-t border-neutral-400 pt-4 text-center text-xs text-neutral-600">
          {t('print.a4.footer')}
        </footer>
      </div>
    );
  },
);

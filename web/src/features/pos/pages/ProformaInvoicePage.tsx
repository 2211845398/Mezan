import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { ReportExportButtons } from '@/components/shared/ReportExportButtons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/features/auth/stores/authStore';
import PoLineVariantSelect from '@/features/purchasing/components/PoLineVariantSelect';
import { formatCurrency } from '@/lib/format';
import { downloadBlob } from '@/lib/downloadBlob';

import {
  exportProformaPdfBlob,
  exportProformaXlsxBlob,
  type ProformaLineIn,
  type ProformaQuoteResponse,
  quoteProforma,
} from '../api';
import { ProductSearch } from '../components/ProductSearch';

type DraftLine = {
  key: string;
  product_id: number;
  variant_id: number | null;
  variant_label: string;
  qty: string;
};

function newLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    product_id: 0,
    variant_id: null,
    variant_label: '',
    qty: '1',
  };
}

function lineIsQuotable(line: DraftLine): boolean {
  return line.product_id > 0 && line.variant_id != null && line.variant_id > 0 && Number(line.qty) > 0;
}

export default function ProformaInvoicePage() {
  const { t, i18n } = useTranslation('pos');
  const branchId = useAuthStore((s) => s.activeBranchId);
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [quote, setQuote] = useState<ProformaQuoteResponse | null>(null);

  const payloadLines = useMemo((): ProformaLineIn[] => {
    return lines.filter(lineIsQuotable).map((l) => ({
      product_id: l.product_id,
      variant_id: l.variant_id!,
      qty: Math.round(Number(l.qty)),
    }));
  }, [lines]);

  const quoteM = useMutation({
    mutationFn: (body: ProformaLineIn[]) => quoteProforma(body),
    onSuccess: (data) => setQuote(data),
    onError: (e) => {
      setQuote(null);
      notifyApiError(e, t('proforma.quote_error'));
    },
  });

  useEffect(() => {
    if (payloadLines.length === 0) {
      setQuote(null);
      return;
    }
    const id = window.setTimeout(() => {
      void quoteM.mutate(payloadLines);
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced quote on draft change
  }, [payloadLines]);

  const patchLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const quoteByKey = useMemo(() => {
    const map = new Map<string, ProformaQuoteResponse['lines'][number]>();
    if (!quote) return map;
    let i = 0;
    for (const draft of lines) {
      if (lineIsQuotable(draft)) {
        const row = quote.lines[i];
        if (row) map.set(draft.key, row);
        i += 1;
      }
    }
    return map;
  }, [lines, quote]);

  const exportBody = useMemo(
    () => ({
      lines: payloadLines,
      branch_id: branchId,
      locale: (i18n.language.startsWith('ar') ? 'ar' : 'en') as 'ar' | 'en',
    }),
    [payloadLines, branchId, i18n.language],
  );

  const exportPdfM = useMutation({
    mutationFn: () => exportProformaPdfBlob(exportBody),
    onSuccess: (blob) => {
      downloadBlob(blob, 'proforma-invoice.pdf');
      toast.success(t('proforma.export_pdf_ok'));
    },
    onError: (e) => notifyApiError(e),
  });

  const exportXlsxM = useMutation({
    mutationFn: () => exportProformaXlsxBlob(exportBody),
    onSuccess: (blob) => {
      downloadBlob(blob, 'proforma-invoice.xlsx');
      toast.success(t('proforma.export_excel_ok'));
    },
    onError: (e) => notifyApiError(e),
  });

  const canExport = payloadLines.length > 0 && quote != null && !quoteM.isPending;
  const currency = quote?.currency_code ?? 'USD';

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:gap-5 sm:p-6" dir={i18n.dir()}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight sm:text-2xl">{t('proforma.title')}</h1>
        <Button
          asChild
          variant="outline"
          className="h-10 shrink-0 whitespace-nowrap border-border/80 bg-background px-4 text-sm font-medium shadow-sm"
        >
          <Link to="/pos/register">{t('invoices.back_register')}</Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <div className="max-h-full overflow-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: '3rem' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '8rem' }} />
              <col style={{ width: '9rem' }} />
              <col style={{ width: '9rem' }} />
              <col style={{ width: '3.5rem' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-border/60 bg-muted/55 backdrop-blur-sm supports-[backdrop-filter]:bg-muted/45">
              <tr>
                <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  #
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('proforma.product')}
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('proforma.variant')}
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('proforma.qty')}
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('proforma.unit_price')}
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('proforma.line_total')}
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {' '}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const hasVariant = line.variant_id != null && line.variant_id > 0;
                const priced = hasVariant ? quoteByKey.get(line.key) : undefined;
                return (
                  <tr
                    key={line.key}
                    className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{index + 1}</td>
                    <td className="min-w-0 px-3 py-2.5">
                      <ProductSearch
                        clearable
                        value={line.product_id > 0 ? String(line.product_id) : undefined}
                        onChange={(id) =>
                          patchLine(line.key, {
                            product_id: id ?? 0,
                            variant_id: null,
                            variant_label: '',
                          })
                        }
                      />
                    </td>
                    <td className="min-w-0 px-3 py-2.5">
                      <PoLineVariantSelect
                        compact
                        labelMode="none"
                        pricedOnly
                        productId={line.product_id}
                        variantId={line.variant_id}
                        variantPickLabel={line.variant_label}
                        disabled={line.product_id <= 0}
                        placeholder={t('proforma.variant_placeholder')}
                        onVariantPick={(vid, label) =>
                          patchLine(line.key, { variant_id: vid, variant_label: label })
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Input
                        id={`pf-qty-${line.key}`}
                        className="h-9"
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => patchLine(line.key, { qty: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-start">
                      {priced ? (
                        <span dir="ltr" className="inline-block whitespace-nowrap tabular-nums">
                          {formatCurrency(Number(priced.unit_price), currency)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-start">
                      {priced ? (
                        <span
                          dir="ltr"
                          className="inline-block whitespace-nowrap font-semibold tabular-nums tracking-tight"
                        >
                          {formatCurrency(Number(priced.line_total), currency)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {lines.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={t('proforma.remove_line')}
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {quote ? (
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm shadow-sm">
          <div className="flex justify-between gap-2">
            <span>{t('proforma.subtotal')}</span>
            <span dir="ltr">{formatCurrency(Number(quote.subtotal), currency)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-2">
            <span>{t('proforma.tax')}</span>
            <span dir="ltr">{formatCurrency(Number(quote.tax_total), currency)}</span>
          </div>
          <div className="mt-2 flex justify-between gap-2 border-t border-border/60 pt-2 font-semibold">
            <span>{t('proforma.total')}</span>
            <span dir="ltr">{formatCurrency(Number(quote.total), currency)}</span>
          </div>
        </div>
      ) : quoteM.isPending && payloadLines.length > 0 ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : null}

      <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => setLines((p) => [...p, newLine()])}
        >
          <Plus className="me-2 size-4" />
          {t('proforma.add_line')}
        </Button>
        <ReportExportButtons
          disabled={!canExport}
          pdfPending={exportPdfM.isPending}
          excelPending={exportXlsxM.isPending}
          onExportPdf={() => exportPdfM.mutate()}
          onExportExcel={() => exportXlsxM.mutate()}
        />
      </div>
    </div>
  );
}

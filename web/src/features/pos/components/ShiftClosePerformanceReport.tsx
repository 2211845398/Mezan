import Decimal from 'decimal.js';
import type { TFunction } from 'i18next';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@/lib/format';
import { formatDateTime, fromISO, now, toISOStringUtc } from '@/lib/date';

import type { PosShiftRead } from '../api';

const REPORT_CURRENCY = 'USD';

export type ShiftCloseReportViewModel = {
  openedAtIso: string;
  /** End instant for period + duration (closed time or “now” for preview). */
  endAtIso: string;
  isProvisionalEnd: boolean;
  transactionsInShift: number;
  expectedCash: string;
  declaredCash: string;
  variance: string;
};

export function buildShiftCloseReportViewModel(
  shift: NonNullable<PosShiftRead>,
  declaredInput: string,
): ShiftCloseReportViewModel {
  const declared = (declaredInput || shift.declared_cash || '0').trim() || '0';
  let varianceStr: string;
  try {
    if (shift.closed_at != null && shift.variance != null && shift.variance !== '') {
      varianceStr = shift.variance;
    } else {
      const v = new Decimal(declared).minus(new Decimal(shift.expected_cash || '0'));
      // Keep a locale-neutral decimal string so varianceDeficitSurplus can parse it
      // (formatFixedDecimal uses Intl and may emit Arabic-Indic digits, breaking parseFloat).
      varianceStr = v.toDecimalPlaces(2).toFixed();
    }
  } catch {
    varianceStr = '—';
  }
  const isProvisionalEnd = shift.closed_at == null;
  const endAtIso = shift.closed_at ?? toISOStringUtc(now());
  return {
    openedAtIso: shift.opened_at,
    endAtIso,
    isProvisionalEnd,
    transactionsInShift: shift.transactions_in_shift ?? 0,
    expectedCash: shift.expected_cash,
    declaredCash: declared,
    variance: varianceStr,
  };
}

/** Split signed variance into shortage (positive amount) vs overage (positive amount) for display. */
export function varianceDeficitSurplus(
  varianceStr: string,
  currency: string,
): { deficit: string; surplus: string } {
  const n = Number.parseFloat(String(varianceStr).replace(/,/g, ''));
  if (!Number.isFinite(n)) return { deficit: '—', surplus: '—' };
  if (n < 0) return { deficit: formatCurrency(Math.abs(n), currency), surplus: '—' };
  if (n > 0) return { deficit: '—', surplus: formatCurrency(n, currency) };
  return { deficit: '—', surplus: '—' };
}

function durationLabel(vm: ShiftCloseReportViewModel, t: TFunction<'pos'>) {
  const start = fromISO(vm.openedAtIso);
  const end = fromISO(vm.endAtIso);
  const ms = Math.max(0, end.getTime() - start.getTime());
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return t('close.report_duration_hm', { h, m });
  return t('close.report_duration_m', { m });
}

export function shiftCloseReportPeriodLabels(
  vm: ShiftCloseReportViewModel,
  t: TFunction<'pos'>,
) {
  const opened = formatDateTime(fromISO(vm.openedAtIso), 'yyyy-MM-dd HH:mm');
  const ended = formatDateTime(fromISO(vm.endAtIso), 'yyyy-MM-dd HH:mm');
  return {
    openedLabel: opened,
    endedLabel: ended,
    durationInline: durationLabel(vm, t),
  };
}

export type ShiftClosePerformanceReportProps = {
  vm: ShiftCloseReportViewModel;
};

export const ShiftClosePerformanceReport = forwardRef<HTMLDivElement, ShiftClosePerformanceReportProps>(
  function ShiftClosePerformanceReport({ vm }, ref) {
    const { t, i18n } = useTranslation('pos');
    const opened = formatDateTime(fromISO(vm.openedAtIso), 'yyyy-MM-dd HH:mm');
    const ended = formatDateTime(fromISO(vm.endAtIso), 'yyyy-MM-dd HH:mm');
    const exp = formatCurrency(vm.expectedCash, REPORT_CURRENCY);
    const dec = formatCurrency(vm.declaredCash, REPORT_CURRENCY);
    const { deficit, surplus } = varianceDeficitSurplus(vm.variance, REPORT_CURRENCY);

    return (
      <div
        ref={ref}
        dir={i18n.dir()}
        className="box-border w-[210mm] max-w-full bg-white p-8 text-black print:w-full print:max-w-none [&_*]:text-black"
      >
        <h1 className="mb-6 border-b border-neutral-800 pb-2 text-xl font-bold">{t('close.report_title')}</h1>
        <table className="w-full border-collapse border border-neutral-800 text-sm">
          <tbody>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('close.report_start')}
              </th>
              <td className="border border-neutral-800 px-3 py-2">{opened}</td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {vm.isProvisionalEnd ? t('close.report_preview_end') : t('close.report_closed_at')}
              </th>
              <td className="border border-neutral-800 px-3 py-2">
                {ended}
                {vm.isProvisionalEnd ? (
                  <span className="mt-1 block text-xs text-neutral-600">{t('close.report_period_note')}</span>
                ) : null}
              </td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('close.report_duration')}
              </th>
              <td className="border border-neutral-800 px-3 py-2">{durationLabel(vm, t)}</td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('close.report_sales_count')}
              </th>
              <td className="border border-neutral-800 px-3 py-2">{vm.transactionsInShift}</td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('close.report_expected')}
              </th>
              <td className="border border-neutral-800 px-3 py-2">{exp}</td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('close.report_declared_label')}
              </th>
              <td className="border border-neutral-800 px-3 py-2">{dec}</td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('close.report_shortage')}
              </th>
              <td className="border border-neutral-800 px-3 py-2 font-semibold">{deficit}</td>
            </tr>
            <tr>
              <th className="border border-neutral-800 bg-neutral-100 px-3 py-2 text-start font-semibold">
                {t('close.report_over')}
              </th>
              <td className="border border-neutral-800 px-3 py-2 font-semibold">{surplus}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  },
);

ShiftClosePerformanceReport.displayName = 'ShiftClosePerformanceReport';

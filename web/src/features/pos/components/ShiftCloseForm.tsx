import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactToPrint } from 'react-to-print';

import { getApiErrorMessage } from '@/api/errorMessages';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatCurrency } from '@/lib/format';
import { notify } from '@/lib/toast';

import { useCloseShift, useCurrentShift } from '../queries';
import { usePosTerminalStore } from '../stores/posTerminalStore';

import {
  buildShiftCloseReportViewModel,
  shiftCloseReportPeriodLabels,
  ShiftClosePerformanceReport,
  varianceDeficitSurplus,
} from './ShiftClosePerformanceReport';

const REPORT_CURRENCY = 'USD';

export type ShiftCloseFormProps = {
  /** Called after a successful close (e.g. close floating dialog). */
  onSuccess?: () => void;
};

export function ShiftCloseForm({ onSuccess }: ShiftCloseFormProps) {
  const { t } = useTranslation('pos');
  const { activeTerminalId: terminalId } = usePosTerminalStore();
  const { data: shift } = useCurrentShift(terminalId);
  const closeMut = useCloseShift();
  const canClose = usePermission('pos_shifts', 'close');

  const [declared, setDeclared] = useState('');

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });

  const reportVm = useMemo(
    () => (shift ? buildShiftCloseReportViewModel(shift, declared) : null),
    [shift, declared],
  );

  const periodLabels = useMemo(
    () =>
      reportVm
        ? shiftCloseReportPeriodLabels(reportVm, t)
        : { openedLabel: '', endedLabel: '', durationInline: '' },
    [reportVm, t],
  );

  const varianceDisplay = useMemo(
    () => (reportVm ? varianceDeficitSurplus(reportVm.variance, REPORT_CURRENCY) : { deficit: '—', surplus: '—' }),
    [reportVm],
  );

  if (!terminalId) {
    return <p className="text-sm text-destructive">{t('gate.select_terminal')}</p>;
  }
  if (!shift) {
    return <p className="text-sm text-muted-foreground">{t('register.need_shift')}</p>;
  }

  const shiftId = shift.id;
  const { openedLabel, durationInline } = periodLabels;

  async function submit() {
    try {
      await closeMut.mutateAsync({ shiftId, declaredCash: declared || '0' });
      notify.success(t('close.done'));
      setDeclared('');
      onSuccess?.();
    } catch (e) {
      notify.error(getApiErrorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      {reportVm ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="mb-2 font-medium">{t('close.report_summary_title')}</p>
          <dl className="space-y-2.5">
            <div className="flex flex-row items-baseline justify-between gap-3">
              <dt className="m-0 max-w-[58%] shrink-0 text-end text-neutral-500 dark:text-neutral-400">
                {t('close.report_start')}
              </dt>
              <dd className="m-0 min-w-0 font-medium text-foreground tabular-nums text-start">
                {openedLabel}
              </dd>
            </div>
            <div className="flex flex-row items-baseline justify-between gap-3">
              <dt className="m-0 max-w-[58%] shrink-0 text-end text-neutral-500 dark:text-neutral-400">
                {t('close.report_duration')}
              </dt>
              <dd className="m-0 min-w-0 font-medium text-foreground text-start">{durationInline}</dd>
            </div>
            <div className="flex flex-row items-baseline justify-between gap-3">
              <dt className="m-0 max-w-[58%] shrink-0 text-end text-neutral-500 dark:text-neutral-400">
                {t('close.report_sales_count')}
              </dt>
              <dd className="m-0 min-w-0 font-medium text-foreground tabular-nums text-start">
                {reportVm.transactionsInShift}
              </dd>
            </div>
            <div className="flex flex-row items-baseline justify-between gap-3">
              <dt className="m-0 max-w-[58%] shrink-0 text-end text-neutral-500 dark:text-neutral-400">
                {t('close.report_expected')}
              </dt>
              <dd className="m-0 min-w-0 font-medium text-foreground tabular-nums text-start">
                {formatCurrency(reportVm.expectedCash, REPORT_CURRENCY)}
              </dd>
            </div>
            <div className="flex flex-row items-baseline justify-between gap-3">
              <dt className="m-0 max-w-[58%] shrink-0 text-end text-neutral-500 dark:text-neutral-400">
                {t('close.report_declared_label')}
              </dt>
              <dd className="m-0 min-w-0 font-medium text-foreground tabular-nums text-start">
                {declared.trim()
                  ? formatCurrency(declared, REPORT_CURRENCY)
                  : t('close.report_declared_empty')}
              </dd>
            </div>
            <div className="flex flex-row items-baseline justify-between gap-3">
              <dt className="m-0 max-w-[58%] shrink-0 text-end text-neutral-500 dark:text-neutral-400">
                {t('close.report_shortage')}
              </dt>
              <dd className="m-0 min-w-0 font-medium text-foreground tabular-nums text-start">
                {varianceDisplay.deficit}
              </dd>
            </div>
            <div className="flex flex-row items-baseline justify-between gap-3">
              <dt className="m-0 max-w-[58%] shrink-0 text-end text-neutral-500 dark:text-neutral-400">
                {t('close.report_over')}
              </dt>
              <dd className="m-0 min-w-0 font-medium text-foreground tabular-nums text-start">
                {varianceDisplay.surplus}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="pos-shift-close-declared">
          {t('close.declared')}
        </label>
        <MoneyInput id="pos-shift-close-declared" value={declared} onChange={setDeclared} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void submit()} disabled={!canClose || closeMut.isPending}>
          {t('close.submit')}
        </Button>
        <Button type="button" variant="outline" disabled={!reportVm} onClick={() => void handlePrint()}>
          {t('close.report_print')}
        </Button>
      </div>

      <div
        className="pointer-events-none fixed -left-[10000px] top-0 h-0 w-0 overflow-hidden"
        aria-hidden="true"
      >
        {reportVm ? <ShiftClosePerformanceReport ref={printRef} vm={reportVm} /> : null}
      </div>
    </div>
  );
}

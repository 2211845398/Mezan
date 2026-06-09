import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DateRangeFields } from '@/components/shared/form/DateRangeFields';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { localDayEndToIsoUtc, localDayStartToIsoUtc, now, utcCalendarDayKey } from '@/lib/date';

import { createDiscountRule, updateDiscountRule } from '../../api';
import { crmKeys, discountDetailQueryOptions } from '../../queries';

export const DISCOUNT_DIALOG_FORM_ID = 'crm-discount-dialog-form';

export type DiscountFormProps = {
  /** `null` = new rule; positive id = edit existing */
  dialogDiscountId: number | null;
  onDismiss: () => void;
};

function parsePercent(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return n;
}

export default function DiscountForm({ dialogDiscountId, onDismiss }: DiscountFormProps) {
  const isEdit = dialogDiscountId != null && dialogDiscountId > 0;
  const did = isEdit ? dialogDiscountId : NaN;

  const { t } = useTranslation('crm');
  const qc = useQueryClient();

  const { data: existing } = useQuery({
    ...discountDetailQueryOptions(did),
    enabled: isEdit,
  });

  const todayYmd = useMemo(() => utcCalendarDayKey(now()), []);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [percentStr, setPercentStr] = useState('10');
  const [startDay, setStartDay] = useState(todayYmd);
  const [endDay, setEndDay] = useState('');

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setCode(existing.code);
      setPercentStr(String(existing.value));
      setStartDay(existing.start_date.slice(0, 10));
      setEndDay(existing.end_date ? existing.end_date.slice(0, 10) : '');
    }
  }, [existing]);

  const incompatibleRule =
    isEdit && existing && String(existing.discount_type) !== 'percentage';

  const mCreate = useMutation({
    mutationFn: () => {
      const pct = parsePercent(percentStr);
      if (pct == null) throw new Error(t('discounts.percent_invalid'));
      const startIso = startDay.trim()
        ? localDayStartToIsoUtc(startDay.trim())
        : localDayStartToIsoUtc(todayYmd);
      const endIso =
        endDay.trim() === '' ? null : localDayEndToIsoUtc(endDay.trim());
      if (endIso && endIso <= startIso) {
        throw new Error(t('discounts.end_before_start'));
      }
      return createDiscountRule({
        name: name.trim(),
        code: code.trim(),
        discount_type: 'percentage',
        value: String(pct),
        start_date: startIso,
        end_date: endIso,
        target_product_ids: null,
        stackable: false,
        status: 'active',
        min_order_amount: null,
        max_discount_amount: null,
        usage_limit: null,
        buy_qty: null,
        get_qty: null,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.root });
      toast.success(t('discounts.saved'));
      onDismiss();
    },
    onError: (error) => {
      if (error instanceof Error && error.message && !('response' in error)) {
        toast.error(error.message);
        return;
      }
      notifyApiError(error, t('errors.generic'));
    },
  });

  const mUpdate = useMutation({
    mutationFn: () => {
      const pct = parsePercent(percentStr);
      if (pct == null) throw new Error(t('discounts.percent_invalid'));
      const startIso = startDay.trim()
        ? localDayStartToIsoUtc(startDay.trim())
        : localDayStartToIsoUtc(todayYmd);
      const endIso =
        endDay.trim() === '' ? null : localDayEndToIsoUtc(endDay.trim());
      if (endIso && endIso <= startIso) {
        throw new Error(t('discounts.end_before_start'));
      }
      return updateDiscountRule(did, {
        name: name.trim(),
        code: code.trim(),
        discount_type: 'percentage',
        value: String(pct),
        start_date: startIso,
        end_date: endIso,
        target_product_ids: null,
        buy_qty: null,
        get_qty: null,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.root });
      toast.success(t('discounts.saved'));
      onDismiss();
    },
    onError: (error) => {
      if (error instanceof Error && error.message && !('response' in error)) {
        toast.error(error.message);
        return;
      }
      notifyApiError(error, t('errors.generic'));
    },
  });

  const submit = () => {
    if (!name.trim() || !code.trim()) {
      toast.error(t('discounts.required'));
      return;
    }
    if (incompatibleRule) {
      toast.error(t('discounts.unsupported_type'));
      return;
    }
    const effectiveStartYmd = startDay.trim() || todayYmd;
    if (endDay.trim() && endDay.trim() < effectiveStartYmd) {
      toast.error(t('discounts.end_before_start'));
      return;
    }
    if (isEdit) void mUpdate.mutate();
    else void mCreate.mutate();
  };

  return (
    <form
      id={DISCOUNT_DIALOG_FORM_ID}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {incompatibleRule ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          {t('discounts.unsupported_type')}
        </p>
      ) : null}

      <div className="grid gap-1">
        <Label>{t('discounts.col.name')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </div>
      <div className="grid gap-1">
        <Label>{t('discounts.col.code')}</Label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={isEdit}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-1">
        <Label>{t('discounts.percent_label')}</Label>
        <div className="relative">
          <Input
            inputMode="decimal"
            value={percentStr}
            onChange={(e) => setPercentStr(e.target.value)}
            className="pe-10"
          />
          <span
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
            aria-hidden
          >
            %
          </span>
        </div>
      </div>

      <DateRangeFields
        className="flex-col items-stretch"
        fromValue={startDay}
        toValue={endDay}
        onFromChange={setStartDay}
        onToChange={setEndDay}
        fromLabel={<Label>{t('discounts.start_day')}</Label>}
        toLabel={<Label>{t('discounts.end_day')}</Label>}
      />

    </form>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { Layers, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AccountingBranchFilter } from '@/features/accounting/components/AccountingBranchFilter';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { formatMoney } from '@/lib/format';
import { parsePositiveDecimal } from '@/lib/numericInput';

import type { PricingEvaluationRow } from '../../api';
import { commitProductSellPrice, evaluatePricingMatrix } from '../../api';
import { catalogKeys } from '../../queries';

import { buildPricingDetailPath, pricingListBasePath } from './pricingPaths';

const PAGE_SIZE = 50;
const MAX_MARKUP_PCT = 1000;
const FALLBACK_DEFAULT_MARGIN = '30';

function evaluationRowKey(row: Pick<PricingEvaluationRow, 'product_id' | 'variant_id'>): string {
  return `${row.product_id}-${row.variant_id}`;
}

function normalizeMarginInput(value: string): string {
  if (value === '' || value === '-') return value;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return value;
  if (n < 0) return '0';
  if (n > MAX_MARKUP_PCT) return String(MAX_MARKUP_PCT);
  return value;
}

function computeSuggestedPrice(valuationCost: string, marginPct: string): string {
  const cost = new Decimal(valuationCost || '0');
  const margin = Number.parseFloat(marginPct);
  if (!Number.isFinite(margin) || margin < 0) {
    return cost.toDecimalPlaces(2).toFixed();
  }
  const clamped = Math.min(margin, MAX_MARKUP_PCT);
  const multiplier = new Decimal(1).plus(new Decimal(clamped).div(100));
  return cost.times(multiplier).toDecimalPlaces(2).toFixed();
}

type RowDraft = {
  targetMargin: string;
  finalPrice: string;
};

export default function PricingEvaluationPage() {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const listBasePath = pricingListBasePath(pathname);
  const defaultBranchId = useAuthStore((s) => s.activeBranchId ?? s.user?.branch_id ?? null);
  const [searchParams, setSearchParams] = useSearchParams();

  const branchId = useMemo((): number | null => {
    const raw = searchParams.get('branch_id');
    if (raw === 'all') return null;
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return defaultBranchId;
  }, [defaultBranchId, searchParams]);

  const qText = searchParams.get('q') ?? '';
  const needsPricingOnly = searchParams.get('needs_pricing_only') !== '0';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [qDraft, setQDraft] = useState(qText);
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({});
  const [committingKey, setCommittingKey] = useState<string | null>(null);

  useEffect(() => {
    setQDraft(qText);
  }, [qText]);

  useEffect(() => {
    const raw = searchParams.get('branch_id');
    const expected = branchId == null ? 'all' : String(branchId);
    if (raw !== expected) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('branch_id', expected);
          return next;
        },
        { replace: true },
      );
    }
  }, [branchId, searchParams, setSearchParams]);

  const queryParams = useMemo((): Parameters<typeof evaluatePricingMatrix>[0] => {
    const p: Parameters<typeof evaluatePricingMatrix>[0] = {
      needs_pricing_only: needsPricingOnly,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    if (branchId != null && branchId > 0) {
      p.branch_id = branchId;
    }
    if (qText) {
      p.q = qText;
    }
    return p;
  }, [branchId, needsPricingOnly, page, qText]);

  const evaluation = useQuery({
    queryKey: catalogKeys.pricingEvaluation(queryParams as unknown as Record<string, unknown>),
    queryFn: () => evaluatePricingMatrix(queryParams),
  });

  useEffect(() => {
    if (!evaluation.data?.items) return;
    const defaultMargin =
      evaluation.data.default_markup_pct?.trim() || FALLBACK_DEFAULT_MARGIN;
    setRowDrafts((prev) => {
      const next = { ...prev };
      for (const row of evaluation.data.items) {
        const key = evaluationRowKey(row);
        if (!next[key]) {
          const suggested =
            row.suggested_price ??
            computeSuggestedPrice(row.valuation_cost, defaultMargin);
          next[key] = {
            targetMargin: defaultMargin,
            finalPrice: suggested,
          };
        }
      }
      return next;
    });
  }, [evaluation.data?.default_markup_pct, evaluation.data?.items]);

  const commitM = useMutation({
    mutationFn: commitProductSellPrice,
    onSuccess: (_res, vars) => {
      toast.success(t('pricingEvaluation.commit_ok'));
      setCommittingKey(null);
      void qc.invalidateQueries({ queryKey: catalogKeys.root });
      const key = evaluationRowKey({
        product_id: vars.product_id,
        variant_id: vars.variant_id ?? 0,
      });
      setRowDrafts((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    },
    onError: (e) => {
      setCommittingKey(null);
      notifyApiError(e, t('errors.generic'));
    },
  });

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        if (key !== 'page') next.delete('page');
        return next;
      });
    },
    [setSearchParams],
  );

  const defaultMargin =
    evaluation.data?.default_markup_pct?.trim() || FALLBACK_DEFAULT_MARGIN;

  const updateRowDraft = (key: string, patch: Partial<RowDraft>, valuationCost: string) => {
    setRowDrafts((prev) => {
      const current = prev[key] ?? {
        targetMargin: defaultMargin,
        finalPrice: computeSuggestedPrice(valuationCost, defaultMargin),
      };
      const targetMargin = patch.targetMargin ?? current.targetMargin;
      const finalPrice =
        patch.targetMargin !== undefined
          ? computeSuggestedPrice(valuationCost, targetMargin)
          : (patch.finalPrice ?? current.finalPrice);
      return { ...prev, [key]: { targetMargin, finalPrice } };
    });
  };

  const totalPages = evaluation.data ? Math.max(1, Math.ceil(evaluation.data.total / PAGE_SIZE)) : 1;
  const currency = evaluation.data?.currency_code ?? 'USD';

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('pricingEvaluation.title')} />

      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        <div className="min-w-[12rem] flex-1">
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('pricingEvaluation.branch')}
          </Label>
          <AccountingBranchFilter
            value={branchId}
            onChange={(id) => setParam('branch_id', id != null ? String(id) : 'all')}
            allowClear
            clearLabel={t('pricingEvaluation.all_branches')}
            namesOnly
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('pricingEvaluation.search')}
          </Label>
          <Input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setParam('q', qDraft.trim() || null);
            }}
            onBlur={() => setParam('q', qDraft.trim() || null)}
            placeholder={t('pricingEvaluation.search_ph')}
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="needs-pricing-only"
            checked={needsPricingOnly}
            onCheckedChange={(v) => setParam('needs_pricing_only', v ? '1' : '0')}
          />
          <Label htmlFor="needs-pricing-only" className="text-sm">
            {t('pricingEvaluation.needs_pricing_only')}
          </Label>
        </div>
        {evaluation.data && evaluation.data.valuation_policy === 'fifo' ? (
          <Badge variant="secondary" className="mb-1 shrink-0">
            {evaluation.data.valuation_policy_label}
          </Badge>
        ) : null}
      </div>

      {evaluation.isLoading ? (
        <div className="flex min-h-[12rem] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : evaluation.isError ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-destructive">{t('errors.generic')}</p>
          <Button type="button" variant="outline" onClick={() => void evaluation.refetch()}>
            {t('actions.refresh')}
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pricingEvaluation.col.product')}</TableHead>
                  <TableHead className="text-end">{t('pricingEvaluation.col.system_cost')}</TableHead>
                  <TableHead className="text-end">{t('pricingEvaluation.col.last_cost')}</TableHead>
                  <TableHead>{t('pricingEvaluation.col.breakdown')}</TableHead>
                  <TableHead className="w-[6.9rem] whitespace-nowrap">
                    {t('pricingEvaluation.col.margin')}
                  </TableHead>
                  <TableHead className="text-end">{t('pricingEvaluation.col.suggested')}</TableHead>
                  <TableHead className="w-[10rem]">{t('pricingEvaluation.col.final_price')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {evaluation.data?.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      {t('pricingEvaluation.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  evaluation.data?.items.map((row) => {
                    const key = evaluationRowKey(row);
                    const draft = rowDrafts[key] ?? {
                      targetMargin: defaultMargin,
                      finalPrice:
                        row.suggested_price ??
                        computeSuggestedPrice(row.valuation_cost, defaultMargin),
                    };
                    const suggested = computeSuggestedPrice(row.valuation_cost, draft.targetMargin);
                    const isCommitting = committingKey === key && commitM.isPending;
                    const displayName = row.variant_label ?? row.name;
                    const detailPath = buildPricingDetailPath(
                      listBasePath,
                      row.product_id,
                      row.variant_id,
                      searchParams,
                    );

                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <div className="font-semibold">{displayName}</div>
                          {row.current_sell_price != null && row.has_sell_price ? (
                            <div className="mt-0.5 text-sm text-muted-foreground num-latin">
                              {t('pricingEvaluation.current_price_value', {
                                price: formatMoney(row.current_sell_price),
                              })}
                            </div>
                          ) : (
                            <Badge variant="attention" className="mt-1">
                              {t('pricingEvaluation.no_sell_price')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-end num-latin">
                          {formatMoney(row.current_system_cost)}
                        </TableCell>
                        <TableCell className="text-end num-latin">
                          {row.last_received_cost != null
                            ? formatMoney(row.last_received_cost)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Button type="button" size="sm" variant="outline" asChild>
                            <Link to={detailPath}>
                              <Layers className="me-1 size-3.5" />
                              {t('pricingEvaluation.open_evaluation')}
                            </Link>
                          </Button>
                        </TableCell>
                        <TableCell className="w-[6.9rem]">
                          <Input
                            type="number"
                            min={0}
                            max={1000}
                            step={0.1}
                            className="num-latin h-8"
                            value={draft.targetMargin}
                            onChange={(e) => {
                              const normalized = normalizeMarginInput(e.target.value);
                              updateRowDraft(
                                key,
                                { targetMargin: normalized },
                                row.valuation_cost,
                              );
                            }}
                            aria-label={t('pricingEvaluation.col.margin')}
                          />
                        </TableCell>
                        <TableCell className="text-end num-latin font-medium">
                          {formatMoney(suggested)}
                        </TableCell>
                        <TableCell>
                          <MoneyInput
                            className="h-8 min-w-[8rem]"
                            value={draft.finalPrice}
                            currency={currency}
                            onValueChange={(v) =>
                              updateRowDraft(key, { finalPrice: v }, row.valuation_cost)
                            }
                            aria-label={t('pricingEvaluation.col.final_price')}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            disabled={isCommitting || parsePositiveDecimal(draft.finalPrice) == null}
                            onClick={() => {
                              if (parsePositiveDecimal(draft.finalPrice) == null) {
                                toast.error(t('pricingEvaluation.price_must_be_positive'));
                                return;
                              }
                              setCommittingKey(key);
                              commitM.mutate({
                                product_id: row.product_id,
                                variant_id: row.variant_id,
                                sell_price: draft.finalPrice,
                              });
                            }}
                          >
                            {isCommitting ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              t('pricingEvaluation.commit')
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground num-latin">
                {t('pricingEvaluation.page_info', {
                  page,
                  total: totalPages,
                  count: evaluation.data?.total ?? 0,
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setParam('page', String(page - 1))}
                >
                  {t('pricingEvaluation.prev')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setParam('page', String(page + 1))}
                >
                  {t('pricingEvaluation.next')}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

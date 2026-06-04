import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';

import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';

import type { PricingEvaluationRow } from '../../api';
import { evaluatePricingMatrix, fetchPricingPurchaseHistory } from '../../api';
import { catalogKeys } from '../../queries';

import { buildPricingListPath, pricingListBasePath } from './pricingPaths';

function ValuationBreakdownSection({
  row,
  policy,
}: {
  row: PricingEvaluationRow;
  policy: string;
}) {
  const { t } = useTranslation('catalog');

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-4 text-base font-semibold">{t('pricingEvaluation.breakdown_title')}</h2>
      {policy === 'fifo' && row.fifo_layers?.length ? (
        <ul className="space-y-2 text-sm">
          {row.fifo_layers.map((layer) => (
            <li
              key={layer.layer_index}
              className="rounded-md border bg-muted/30 px-3 py-2 num-latin"
            >
              {t('pricingEvaluation.fifo_layer', {
                index: layer.layer_index,
                qty: layer.qty_remaining,
                cost: formatMoney(layer.unit_cost),
              })}
            </li>
          ))}
        </ul>
      ) : null}
      {policy !== 'fifo' && row.wavg_breakdown ? (
        <div className="space-y-3 rounded-md border bg-muted/30 p-4 text-sm">
          <p className="font-medium">{t('pricingEvaluation.wavg_formula')}</p>
          <p className="num-latin text-muted-foreground">{row.wavg_breakdown.formula}</p>
          <dl className="grid grid-cols-2 gap-2 num-latin">
            <dt>{t('pricingEvaluation.wavg_old_qty')}</dt>
            <dd>{row.wavg_breakdown.old_qty}</dd>
            <dt>{t('pricingEvaluation.wavg_old_cost')}</dt>
            <dd>{formatMoney(row.wavg_breakdown.old_cost)}</dd>
            <dt>{t('pricingEvaluation.wavg_new_qty')}</dt>
            <dd>{row.wavg_breakdown.new_qty}</dd>
            <dt>{t('pricingEvaluation.wavg_new_cost')}</dt>
            <dd>{formatMoney(row.wavg_breakdown.new_cost)}</dd>
            <dt>{t('pricingEvaluation.wavg_total_qty')}</dt>
            <dd>{row.wavg_breakdown.total_qty}</dd>
            <dt>{t('pricingEvaluation.wavg_blended')}</dt>
            <dd className="font-semibold">{formatMoney(row.wavg_breakdown.blended_cost)}</dd>
          </dl>
        </div>
      ) : null}
      {!row.fifo_layers?.length && !row.wavg_breakdown ? (
        <p className="text-sm text-muted-foreground">{t('pricingEvaluation.no_breakdown')}</p>
      ) : null}
    </section>
  );
}

function PurchaseHistorySection({
  branchId,
  productId,
  variantId,
}: {
  branchId: number;
  productId: number;
  variantId: number;
}) {
  const { t } = useTranslation('catalog');
  const history = useQuery({
    queryKey: ['catalog', 'pricingHistory', branchId, productId, variantId],
    queryFn: () =>
      fetchPricingPurchaseHistory({
        branch_id: branchId,
        product_id: productId,
        variant_id: variantId,
      }),
  });

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-4 text-base font-semibold">{t('pricingEvaluation.view_history')}</h2>
      {history.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : history.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pricingEvaluation.no_history')}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pricingEvaluation.history_date')}</TableHead>
                <TableHead className="text-end">{t('pricingEvaluation.history_qty')}</TableHead>
                <TableHead className="text-end">{t('pricingEvaluation.history_cost')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.data?.map((h) => (
                <TableRow key={`${h.receipt_id}-${h.received_at}`}>
                  <TableCell className="text-sm num-latin">
                    {new Date(h.received_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-end num-latin">{h.qty}</TableCell>
                  <TableCell className="text-end num-latin">{formatMoney(h.unit_cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

export default function PricingEvaluationDetailPage() {
  const { t } = useTranslation('catalog');
  const { pathname } = useLocation();
  const { productId: productIdRaw, variantId: variantIdRaw } = useParams();
  const [searchParams] = useSearchParams();

  const productId = Number(productIdRaw);
  const variantId = Number(variantIdRaw);
  const branchId = useMemo((): number | null => {
    const raw = searchParams.get('branch_id');
    if (!raw || raw === 'all') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

  const basePath = pricingListBasePath(pathname);
  const listPath = buildPricingListPath(basePath, searchParams);

  const evaluation = useQuery({
    queryKey: catalogKeys.pricingEvaluation({
      ...(branchId != null ? { branch_id: branchId } : {}),
      product_id: productId,
      variant_id: variantId,
      needs_pricing_only: false,
      limit: 1,
    }),
    queryFn: () =>
      evaluatePricingMatrix({
        ...(branchId != null ? { branch_id: branchId } : {}),
        product_id: productId,
        variant_id: variantId,
        needs_pricing_only: false,
        limit: 1,
      }),
    enabled:
      Number.isFinite(productId) &&
      productId > 0 &&
      Number.isFinite(variantId) &&
      variantId > 0,
  });

  const row = evaluation.data?.items[0];
  const policy = evaluation.data?.valuation_policy ?? 'wavg';
  const displayName = row ? (row.variant_label ?? row.name) : '';

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('pricingEvaluation.detail_title')}
        subtitle={displayName || undefined}
        actions={<BackButton to={listPath} label={t('pricingEvaluation.back_to_list')} />}
      />

      {evaluation.isLoading ? (
        <div className="flex min-h-[12rem] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : evaluation.isError || !row ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-destructive">{t('errors.generic')}</p>
          <Button type="button" variant="outline" onClick={() => void evaluation.refetch()}>
            {t('actions.refresh')}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{t('pricingEvaluation.col.product')}</p>
              <p className="font-semibold">{displayName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('pricingEvaluation.col.system_cost')}</p>
              <p className="num-latin font-medium">{formatMoney(row.current_system_cost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('pricingEvaluation.col.last_cost')}</p>
              <p className="num-latin font-medium">
                {row.last_received_cost != null ? formatMoney(row.last_received_cost) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('pricingEvaluation.current_price')}</p>
              {row.current_sell_price != null && row.has_sell_price ? (
                <p className="num-latin font-medium">
                  {t('pricingEvaluation.current_price_value', {
                    price: formatMoney(row.current_sell_price),
                  })}
                </p>
              ) : (
                <Badge variant="attention" className="mt-1">
                  {t('pricingEvaluation.no_sell_price')}
                </Badge>
              )}
            </div>
          </div>

          {evaluation.data?.valuation_policy === 'fifo' ? (
            <Badge variant="secondary" className="w-fit shrink-0">
              {evaluation.data.valuation_policy_label}
            </Badge>
          ) : null}

          <ValuationBreakdownSection row={row} policy={policy} />
          {branchId != null ? (
            <PurchaseHistorySection
              branchId={branchId}
              productId={productId}
              variantId={variantId}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('pricingEvaluation.history_all_branches')}</p>
          )}
        </>
      )}
    </div>
  );
}

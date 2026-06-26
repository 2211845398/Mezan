import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { getProductWithVariants } from '@/features/catalog/api';
import { catalogKeys } from '@/features/catalog/queries';
import { formatIso } from '@/lib/date';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';

import type { StockMovement } from '../../api';
import { useMovementsQuery, useStockCardQuery } from '../../queries';
import { formatMovementKind, formatMovementReason } from '../../utils/movementLabels';
import { ReorderPolicyPanel } from './ReorderPolicyPanel';

const ALL_VARIANTS = '__all';

export default function ProductMovementsPage() {
  const { productId: pid } = useParams<{ productId: string }>();
  const { t } = useTranslation('inventory');
  const [searchParams, setSearchParams] = useSearchParams();

  const productId = pid ? Number(pid) : NaN;
  const branchId = searchParams.get('branch_id') ? Number(searchParams.get('branch_id')) : null;
  const variantParam = searchParams.get('variant_id');
  const variantId = variantParam ? Number(variantParam) : null;

  const { data: stockCard, isLoading: cardLoading } = useStockCardQuery(
    Number.isFinite(productId) && productId > 0 ? productId : null,
  );

  const { data: variantData } = useQuery({
    queryKey: catalogKeys.productWithVariants(productId),
    queryFn: () => getProductWithVariants(productId),
    enabled: Number.isFinite(productId) && productId > 0,
  });

  const movementParams = useMemo(
    () => ({
      product_id: productId,
      ...(branchId != null ? { branch_id: branchId } : {}),
      ...(variantId != null ? { variant_id: variantId } : {}),
      limit: 200,
      offset: 0,
    }),
    [productId, branchId, variantId],
  );

  const { data: movements = [], isLoading, isError, refetch } = useMovementsQuery(movementParams);

  const setBranchId = useCallback(
    (id: number | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id == null) next.delete('branch_id');
        else next.set('branch_id', String(id));
        return next;
      });
    },
    [setSearchParams],
  );

  const setVariantId = useCallback(
    (id: number | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id == null) next.delete('variant_id');
        else next.set('variant_id', String(id));
        return next;
      });
    },
    [setSearchParams],
  );

  const columns = useMemo(
    () =>
      defineColumns<StockMovement>()([
        { id: 'id', accessorKey: 'id', header: t('adjustments.col.movement_no') },
        {
          id: 'branch',
          header: t('adjustments.col.branch'),
          cell: ({ row }) => row.original.branch_name ?? String(row.original.branch_id),
        },
        {
          id: 'variant',
          header: t('productMovements.filter.variant'),
          cell: ({ row }) => row.original.variant_name ?? '—',
        },
        {
          id: 'delta',
          accessorKey: 'qty_delta',
          header: t('adjustments.col.delta'),
          cell: ({ row }) => {
            const delta = row.original.qty_delta ?? 0;
            const isPositive = delta > 0;
            return (
              <span
                className={cn(
                  'tabular-nums num-latin font-medium',
                  isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
                )}
              >
                {isPositive ? `+${delta}` : String(delta)}
              </span>
            );
          },
        },
        {
          id: 'kind',
          header: t('adjustments.col.kind'),
          cell: ({ row }) => formatMovementKind(row.original.movement_kind, t),
        },
        {
          id: 'reason',
          header: t('adjustments.col.reason'),
          cell: ({ row }) => formatMovementReason(row.original.reason, t),
        },
        {
          id: 'at',
          accessorKey: 'created_at',
          header: t('adjustments.col.at'),
          cell: ({ row }) =>
            row.original.created_at ? formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm') : '—',
        },
      ]),
    [t],
  );

  if (!Number.isFinite(productId) || productId <= 0) {
    return <p className="p-6 text-muted-foreground">{t('stockCard.invalid')}</p>;
  }

  const titleText = stockCard?.product_name ?? (cardLoading ? t('loading') : `#${productId}`);
  const subtitle = stockCard ? `${stockCard.sku} · ${stockCard.category_name}` : t('productMovements.subtitle');
  const imageRaw = variantData?.product.image_url?.trim();
  const imageSrc = imageRaw ? (resolveMediaUrl(imageRaw) ?? imageRaw) : null;

  const title = (
    <div className="flex items-center gap-3">
      {imageSrc ? (
        <div className="size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
          <img src={imageSrc} alt="" className="size-full object-cover" loading="lazy" />
        </div>
      ) : null}
      <span>{titleText}</span>
    </div>
  );

  const variants = variantData?.variants ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<BackButton to="/inventory/stock" label={t('actions.back')} />}
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <BranchCombobox
            label={t('stock.filter.branch')}
            value={branchId}
            onChange={setBranchId}
            allowClear
            clearLabel={t('stock.filter.all_branches')}
            showCode={false}
          />
        </div>
        {variants.length > 1 ? (
          <div className="grid min-w-[12rem] flex-1 gap-1">
            <Label>{t('productMovements.filter.variant')}</Label>
            <Select
              value={variantId != null ? String(variantId) : ALL_VARIANTS}
              onValueChange={(v) => setVariantId(v === ALL_VARIANTS ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VARIANTS}>{t('productMovements.filter.all_variants')}</SelectItem>
                {variants.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.display_label?.trim() || v.sku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {branchId != null && branchId > 0 ? (
        <ReorderPolicyPanel branchId={branchId} productId={productId} variantId={variantId} />
      ) : (
        <p className="text-sm text-muted-foreground">{t('productMovements.select_branch')}</p>
      )}

      <DataTable
        mode="client"
        showSearch={false}
        columns={columns}
        data={movements}
        isLoading={isLoading || cardLoading}
        isError={isError}
        onRetry={() => void refetch()}
        getRowId={(r) => String(r.id)}
      />
    </div>
  );
}

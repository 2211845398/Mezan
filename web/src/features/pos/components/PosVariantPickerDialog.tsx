import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getProductWithVariants, type ProductWithVariantsVariantRow } from '@/features/catalog/api';
import { formatPurchasingVariantOption } from '@/features/catalog/lib/purchasingVariantLabel';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  productId: number | null;
  productName: string;
  branchId?: number | null;
  onOpenChange: (open: boolean) => void;
  onSelectVariant: (variantId: number) => void;
};

function variantCardLabel(
  v: ProductWithVariantsVariantRow,
  productName: string,
): string {
  if (v.display_label?.trim()) return v.display_label.trim();
  return formatPurchasingVariantOption({
    display_name: productName,
    sku: v.sku,
    barcode: v.barcode,
    attribute_values: v.attribute_values,
  });
}

export function PosVariantPickerDialog({
  open,
  productId,
  productName,
  branchId,
  onOpenChange,
  onSelectVariant,
}: Props) {
  const { t } = useTranslation('pos');

  const { data, isLoading } = useQuery({
    queryKey: ['pos', 'variant-picker', productId, branchId ?? null],
    queryFn: () => getProductWithVariants(productId!),
    enabled: open && productId != null && productId > 0,
    staleTime: 30_000,
  });

  const variants = (data?.variants ?? []).filter((v) => v.active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('register.variant_picker_title', { name: productName })}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">…</p>
          ) : variants.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('register.variant_picker_empty')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {variants.map((v) => {
                const stock =
                  branchId != null && branchId > 0 && v.stock_by_branch
                    ? Number(v.stock_by_branch[branchId] ?? 0)
                    : null;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={cn(
                      'rounded-xl border bg-card p-3 text-start shadow-sm transition',
                      'hover:border-primary/50 hover:bg-muted/40',
                    )}
                    onClick={() => {
                      onSelectVariant(v.id);
                      onOpenChange(false);
                    }}
                  >
                    <p className="text-sm font-semibold leading-snug">{variantCardLabel(v, productName)}</p>
                    {stock != null ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('register.variant_picker_stock', { count: stock })}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end border-t pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('register.variant_picker_cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

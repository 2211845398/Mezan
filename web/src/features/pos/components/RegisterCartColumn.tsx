import { ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useOnline } from '@/hooks/useOnline';
import type { CartRead } from '../api';
import { CartLineRow } from './CartLineRow';
import { PosNumpad } from './PosNumpad';
import type { ReturnExchangeLineMeta } from './ReturnDrawer';

export type RegisterCartColumnProps = {
  cart: CartRead;
  editable: boolean;
  isLocked: boolean;
  onQtyChange: (lineId: number, productId: number, variantId: number, qty: number) => void;
  onUomChange?: (lineId: number, productId: number, variantId: number, uomId: number, qty: number) => void;
  currency: string;
  /** Paid carts this shift: completed sales invoices from `/pos/shifts/current` (`transactions_in_shift`). */
  transactionsInShift: number;
  /** Return-session line metadata keyed by sales_invoice_line_id. */
  returnSession?: Record<number, ReturnExchangeLineMeta> | null;
  selectedLineId: number | null;
  onSelectLine: (lineId: number | null) => void;
  numpadBuffer: string;
  onNumpadBufferChange: (value: string) => void;
  onNumpadApply: () => void;
  onNumpadClear: () => void;
};

export function RegisterCartColumn({
  cart,
  editable,
  isLocked,
  onQtyChange,
  onUomChange,
  currency,
  transactionsInShift,
  returnSession = null,
  selectedLineId,
  onSelectLine,
  numpadBuffer,
  onNumpadBufferChange,
  onNumpadApply,
  onNumpadClear,
}: RegisterCartColumnProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();
  const statusLabel = t(`register.status_${cart.status}`, { defaultValue: cart.status });

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
      data-mode="sale"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShoppingCart className="size-4" aria-hidden />
            {t('register.cart')}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border bg-muted/30 px-2.5 py-1 text-muted-foreground">
              {t('register.cart_unique_number', { id: cart.id })}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              {t('register.status')}: {statusLabel}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-1.5 text-sm font-bold text-primary"
            title={t('register.shift_transaction_count')}
          >
            {transactionsInShift}
          </span>
        </div>
      </div>

      {!online ? (
        <p className="mx-4 mt-3 shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {t('shell.offline')}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/15 p-2 sm:p-2.5">
          {!cart.lines?.length ? (
            <div className="flex h-full min-h-0 flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <ShoppingCart className="size-16 opacity-25" />
              <p className="mt-3 text-base font-medium">{t('register.cart_empty')}</p>
            </div>
          ) : (
            cart.lines.map((ln) => {
              const returnMeta = returnSession
                ? Object.values(returnSession).find(
                    (m) =>
                      m.productId === ln.product_id &&
                      m.variantId === (ln.variant_id ?? 0),
                  )
                : undefined;
              const selected = selectedLineId === ln.id;
              return (
                <div
                  key={`${ln.id}-${ln.product_id}-${ln.variant_id ?? 0}`}
                  className="mb-2 cursor-pointer last:mb-0"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, input')) return;
                    onSelectLine(selected ? null : ln.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if ((e.target as HTMLElement).closest('button, input')) return;
                      e.preventDefault();
                      onSelectLine(selected ? null : ln.id);
                    }
                  }}
                >
                  <CartLineRow
                    line={ln}
                    currency={currency}
                    editable={!!editable}
                    isSelected={selected}
                    {...(returnMeta?.qtyLoaded != null ? { maxQty: returnMeta.qtyLoaded } : {})}
                    isReturnLine={returnMeta != null}
                    onQtyChange={(lineId, productId, variantId, qty) => {
                      onQtyChange(lineId, productId, variantId, qty);
                    }}
                    {...(onUomChange
                      ? {
                          onUomChange: (lineId, productId, variantId, uomId) => {
                            onUomChange(lineId, productId, variantId, uomId, Number(ln.qty));
                          },
                        }
                      : {})}
                  />
                </div>
              );
            })
          )}
          {!editable && !isLocked ? (
            <p className="mt-2 text-xs text-muted-foreground">{t('register.cannot_edit')}</p>
          ) : null}
        </div>

        <PosNumpad
          disabled={!editable}
          buffer={numpadBuffer}
          onBufferChange={onNumpadBufferChange}
          onApply={onNumpadApply}
          onClear={onNumpadClear}
        />
      </div>
    </div>
  );
}

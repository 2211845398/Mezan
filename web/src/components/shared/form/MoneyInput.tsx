import Decimal from 'decimal.js';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { formatMoneyCanonicalDisplay } from '@/lib/format';
import { getNumericLocale } from '@/lib/i18n-numbers';
import { sanitiseDecimalInput } from '@/lib/numericInput';
import { cn } from '@/lib/utils';

/*
 * Money input. Display text is locale-formatted via `@/lib/format`;
 * the controlled value stays a canonical decimal string (backend `q2`) that
 * React Hook Form binds to. Arithmetic uses decimal.js so the rounding
 * matches the backend exactly — no float drift on totals.
 */

export type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> & {
  /** Canonical value exposed to RHF — e.g. "1234.50". */
  value?: string;
  /** Fires on every keystroke with the sanitised canonical string. */
  onChange?: (value: string) => void;
  /** Alias for `onChange` (controlled string state). */
  onValueChange?: (value: string) => void;
  currency?: string;
  fractionDigits?: number;
  /** When false (default), minus signs are rejected while typing. */
  allowNegative?: boolean;
  /** External validation error (e.g. react-hook-form). */
  invalid?: boolean | undefined;
};

function formatDisplay(
  canonical: string,
  locale: ReturnType<typeof getNumericLocale>,
  fractionDigits: number,
): string {
  return formatMoneyCanonicalDisplay(canonical, locale, fractionDigits);
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      value = '',
      onChange,
      onValueChange,
      currency,
      fractionDigits = 2,
      allowNegative = false,
      className,
      disabled,
      invalid,
      readOnly,
      ...rest
    },
    ref,
  ) => {
    const emit = onChange ?? onValueChange;
    const locale = getNumericLocale();
    const [focused, setFocused] = React.useState(false);
    const [draft, setDraft] = React.useState<string>(value);

    // Keep the draft in sync when the parent updates the controlled value
    // while the input is unfocused (e.g. after a form reset).
    React.useEffect(() => {
      if (!focused) setDraft(value);
    }, [value, focused]);

    const display = readOnly || !focused
      ? formatDisplay(draft || value, locale, fractionDigits)
      : draft;

    return (
      <div className="relative w-full" {...(currency ? { dir: 'ltr' as const } : {})}>
        {currency ? (
          <span
            className="pointer-events-none absolute start-2 top-1/2 min-w-[2.25rem] -translate-y-1/2 text-start text-[10px] font-medium tabular-nums text-muted-foreground"
            aria-hidden="true"
          >
            {currency}
          </span>
        ) : null}
        <Input
          ref={ref}
          {...rest}
          inputMode="decimal"
          type="text"
          dir="ltr"
          value={display}
          readOnly={readOnly}
          disabled={readOnly ? false : disabled}
          tabIndex={readOnly ? 0 : rest.tabIndex}
          aria-invalid={invalid || rest['aria-invalid'] || undefined}
          className={cn(currency ? 'ps-[3.5rem] pe-2 text-end' : 'text-end', className)}
          onFocus={(e) => {
            if (readOnly) {
              rest.onFocus?.(e);
              return;
            }
            setFocused(true);
            setDraft(value);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            if (readOnly) {
              rest.onBlur?.(e);
              return;
            }
            setFocused(false);
            try {
              let d = new Decimal(draft || '0');
              if (!allowNegative && d.lessThan(0)) {
                d = new Decimal(0);
              }
              const quantised = d.toFixed(fractionDigits, Decimal.ROUND_HALF_UP);
              setDraft(quantised);
              emit?.(quantised);
            } catch {
              emit?.(allowNegative ? draft : '0');
            }
            rest.onBlur?.(e);
          }}
          onChange={(e) => {
            if (readOnly) return;
            const next = sanitiseDecimalInput(e.target.value, { allowNegative });
            setDraft(next);
            emit?.(next);
          }}
        />
      </div>
    );
  },
);
MoneyInput.displayName = 'MoneyInput';

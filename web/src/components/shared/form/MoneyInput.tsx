import Decimal from 'decimal.js';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { getNumericLocale } from '@/lib/i18n-numbers';
import { cn } from '@/lib/utils';

/*
 * Money input. Display text is locale-formatted with `Intl.NumberFormat`;
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
  currency?: string;
  fractionDigits?: number;
};

function sanitiseInput(raw: string): string {
  // Accept both Latin and Arabic-Indic digits; collapse anything else to
  // a single optional decimal point.
  const trimmed = raw.replace(/[\u066C\u002C\s]/g, '');
  const mapped = trimmed
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const match = mapped.match(/^-?\d*(?:\.\d*)?/);
  return match ? match[0] : '';
}

function formatDisplay(canonical: string, locale: string, fractionDigits: number): string {
  if (canonical === '' || canonical === '-' || canonical === '.' || canonical === '-.') {
    return canonical;
  }
  try {
    const d = new Decimal(canonical);
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(d.toNumber());
  } catch {
    return canonical;
  }
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    { value = '', onChange, currency, fractionDigits = 2, className, disabled, ...rest },
    ref,
  ) => {
    const locale = getNumericLocale();
    const [focused, setFocused] = React.useState(false);
    const [draft, setDraft] = React.useState<string>(value);

    // Keep the draft in sync when the parent updates the controlled value
    // while the input is unfocused (e.g. after a form reset).
    React.useEffect(() => {
      if (!focused) setDraft(value);
    }, [value, focused]);

    const display = focused ? draft : formatDisplay(draft || value, locale, fractionDigits);

    return (
      <div className="relative w-full">
        {currency ? (
          <span
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            {currency}
          </span>
        ) : null}
        <Input
          ref={ref}
          inputMode="decimal"
          type="text"
          dir="ltr"
          value={display}
          disabled={disabled}
          className={cn(currency ? 'pe-12 text-end' : 'text-end', className)}
          onFocus={() => {
            setFocused(true);
            setDraft(value);
          }}
          onBlur={(e) => {
            setFocused(false);
            // Quantise to the requested fraction digits on blur so the
            // canonical value always matches backend `Decimal q2`.
            try {
              const d = new Decimal(draft || '0');
              const quantised = d.toFixed(fractionDigits, Decimal.ROUND_HALF_UP);
              setDraft(quantised);
              onChange?.(quantised);
            } catch {
              onChange?.(draft);
            }
            rest.onBlur?.(e);
          }}
          onChange={(e) => {
            const next = sanitiseInput(e.target.value);
            setDraft(next);
            onChange?.(next);
          }}
          {...rest}
        />
      </div>
    );
  },
);
MoneyInput.displayName = 'MoneyInput';

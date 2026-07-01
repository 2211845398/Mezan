import * as React from 'react';

import { Input } from '@/components/ui/input';
import { clampInt, parseNonNegativeInt, sanitiseIntegerInput } from '@/lib/numericInput';
import { cn } from '@/lib/utils';

export type NonNegativeIntegerInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode'
> & {
  value: string | number;
  onValueChange: (value: string) => void;
  /** Minimum allowed value on blur (default 0). */
  min?: number;
  /** When set, caps the value on blur. */
  max?: number;
};

export const NonNegativeIntegerInput = React.forwardRef<HTMLInputElement, NonNegativeIntegerInputProps>(
  ({ value, onValueChange, min = 0, max, className, onBlur, ...rest }, ref) => {
    const display = String(value ?? '');

    return (
      <Input
        ref={ref}
        {...rest}
        type="text"
        inputMode="numeric"
        dir="ltr"
        className={cn('tabular-nums', className)}
        value={display}
        onChange={(e) => {
          onValueChange(sanitiseIntegerInput(e.target.value));
        }}
        onBlur={(e) => {
          const parsed = parseNonNegativeInt(display);
          if (parsed == null) {
            onValueChange(String(min));
          } else {
            onValueChange(String(clampInt(parsed, min, max)));
          }
          onBlur?.(e);
        }}
      />
    );
  },
);
NonNegativeIntegerInput.displayName = 'NonNegativeIntegerInput';

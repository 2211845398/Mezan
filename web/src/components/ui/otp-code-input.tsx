import * as React from 'react';

import { MEZ_FIELD_BORDER_CLASS } from '@/lib/fieldFocus';
import { cn } from '@/lib/utils';

const OTP_LENGTH = 6;

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
};

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function OtpCodeInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: OtpCodeInputProps) {
  const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  const toDigitArray = React.useCallback((raw: string) => {
    const arr = digitsOnly(raw).slice(0, OTP_LENGTH).split('');
    while (arr.length < OTP_LENGTH) arr.push('');
    return arr;
  }, []);

  const digits = toDigitArray(value);

  const setAtIndex = (index: number, nextDigit: string) => {
    const next = toDigitArray(value);
    next[index] = nextDigit;
    onChange(next.join(''));
  };

  const focusIndex = (index: number) => {
    const el = inputRefs.current[index];
    el?.focus();
    el?.select();
  };

  const handleChange = (index: number, raw: string) => {
    const cleaned = digitsOnly(raw);
    if (cleaned.length === 0) {
      setAtIndex(index, '');
      return;
    }
    if (cleaned.length === 1) {
      setAtIndex(index, cleaned);
      if (index < OTP_LENGTH - 1) focusIndex(index + 1);
      return;
    }
    const merged = (digitsOnly(value).slice(0, index) + cleaned).slice(0, OTP_LENGTH);
    onChange(merged);
    focusIndex(Math.min(index + cleaned.length, OTP_LENGTH - 1));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      e.preventDefault();
      setAtIndex(index - 1, '');
      focusIndex(index - 1);
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusIndex(index - 1);
      return;
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      focusIndex(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = digitsOnly(e.clipboardData.getData('text')).slice(0, OTP_LENGTH);
    if (!pasted) return;
    onChange(pasted);
    focusIndex(Math.min(pasted.length, OTP_LENGTH) - 1);
  };

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className="flex justify-center gap-2"
      dir="ltr"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-invalid={ariaInvalid}
          className={cn(
            'size-11 rounded-md bg-background text-center text-lg font-semibold tabular-nums num-latin',
            MEZ_FIELD_BORDER_CLASS,
          )}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

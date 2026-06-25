import { CalendarDays } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { startOfDay } from 'date-fns';

import { format, fromISO } from '@/lib/date';
import { readOnlyFieldClass } from '@/lib/readOnlyFieldStyles';
import { cn } from '@/lib/utils';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DateFieldHandle = {
  /** Commit in-progress typed value and return the effective ISO date (or empty). */
  commitPending: () => string;
};

/*
 * Locale-aware date field: manual YYYY-MM-DD entry + calendar picker.
 * Formats via `@/lib/date` (the only file allowed to use `new Date(`).
 */

export type DateFieldProps = {
  /** ISO date string (`YYYY-MM-DD`) or empty. */
  value?: string | undefined;
  onChange: (next: string) => void;
  placeholder?: string | undefined;
  id?: string | undefined;
  name?: string | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  /** ISO `YYYY-MM-DD`. When set, calendar days strictly before this day are not selectable. */
  minSelectableDate?: string | undefined;
  'aria-label'?: string | undefined;
  /** External validation error (e.g. react-hook-form). */
  invalid?: boolean | undefined;
  /** Text direction for the date input (defaults to ltr for ISO dates). */
  inputDir?: 'ltr' | 'rtl' | 'auto' | undefined;
  /** Reverse flex order so calendar icon sits on the RTL start side. */
  rtlLayout?: boolean | undefined;
};

export const DateField = React.forwardRef<DateFieldHandle, DateFieldProps>(
  (
    {
      value,
      onChange,
      placeholder,
      id,
      name,
      className,
      disabled,
      readOnly,
      minSelectableDate,
      'aria-label': ariaLabel,
      invalid: externalInvalid,
      inputDir = 'ltr',
      rtlLayout = false,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState(value ?? '');
    const [localInvalid, setLocalInvalid] = React.useState(false);
    const showInvalid = externalInvalid || localInvalid;

    React.useEffect(() => {
      setDraft(value ?? '');
      setLocalInvalid(false);
    }, [value]);

    const parsed = value ? safeParseIso(value) : undefined;
    const minDay =
      minSelectableDate && safeParseIso(minSelectableDate)
        ? startOfDay(safeParseIso(minSelectableDate)!)
        : undefined;

    const commitDraft = React.useCallback((): string => {
      const raw = draft.trim();
      if (raw === '') {
        setLocalInvalid(false);
        onChange('');
        return '';
      }
      if (!ISO_DATE_RE.test(raw) || !safeParseIso(raw)) {
        setLocalInvalid(true);
        setDraft(value ?? '');
        return value ?? '';
      }
      if (minDay) {
        const d = safeParseIso(raw)!;
        if (startOfDay(d) < minDay) {
          setLocalInvalid(true);
          setDraft(value ?? '');
          return value ?? '';
        }
      }
      setLocalInvalid(false);
      onChange(raw);
      return raw;
    }, [draft, minDay, onChange, value]);

    React.useImperativeHandle(ref, () => ({ commitPending: commitDraft }), [commitDraft]);

    return (
      <div className={cn('flex gap-1', rtlLayout && 'flex-row-reverse', className)}>
        <Input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          dir={inputDir}
          disabled={readOnly ? false : disabled}
          readOnly={readOnly}
          tabIndex={readOnly ? 0 : undefined}
          aria-label={ariaLabel ?? t('form.pick_date')}
          aria-invalid={showInvalid || undefined}
          placeholder={placeholder ?? 'YYYY-MM-DD'}
          className={cn('num-latin flex-1 font-normal', readOnly && readOnlyFieldClass(false))}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setLocalInvalid(false);
          }}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
            }
          }}
        />
        {!readOnly ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label={t('form.pick_date')}
              className="shrink-0"
            >
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={parsed}
              disabled={minDay ? { before: minDay } : undefined}
              onSelect={(d) => {
                if (!d) return;
                const next = format(d, 'yyyy-MM-dd');
                setDraft(next);
                setLocalInvalid(false);
                onChange(next);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        ) : null}
      </div>
    );
  },
);
DateField.displayName = 'DateField';

function safeParseIso(raw: string): Date | undefined {
  try {
    const d = fromISO(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}

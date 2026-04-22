import { CalendarDays } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, fromISO } from '@/lib/date';
import { cn } from '@/lib/utils';

/*
 * Locale-aware date picker. Consumes shadcn `Calendar` (react-day-picker)
 * inside a `Popover`, formats via `@/lib/date` (the only file allowed to
 * use `new Date(`). The control is fully controlled; feature code wires
 * it to RHF with a <Controller />.
 */

export type DateFieldProps = {
  /** ISO date string (`YYYY-MM-DD`) or empty. */
  value?: string;
  onChange: (next: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

export const DateField = React.forwardRef<HTMLButtonElement, DateFieldProps>(
  (
    { value, onChange, placeholder, id, className, disabled, 'aria-label': ariaLabel },
    ref,
  ) => {
    const { t } = useTranslation();
    const [open, setOpen] = React.useState(false);

    const parsed = value ? safeParseIso(value) : undefined;

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            disabled={disabled}
            id={id}
            aria-label={ariaLabel ?? t('form.pick_date')}
            className={cn('w-full justify-start text-start font-normal', className)}
          >
            <CalendarDays className="me-2 size-4 text-muted-foreground" aria-hidden="true" />
            {parsed ? format(parsed, 'yyyy-MM-dd') : (placeholder ?? t('form.pick_date'))}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={parsed}
            onSelect={(d) => {
              if (!d) return;
              onChange(format(d, 'yyyy-MM-dd'));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
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

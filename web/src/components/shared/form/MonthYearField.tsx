import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, fromISO, now } from '@/lib/date';
import { cn } from '@/lib/utils';

export type MonthYearValue = { year: number; month: number };

export type MonthYearFieldProps = {
  id?: string;
  value: MonthYearValue | null;
  onChange: (next: MonthYearValue) => void;
  /** When set, a "Clear" action is shown in the popover footer. */
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

const MONTH_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function MonthYearField({
  id,
  value,
  onChange,
  onClear,
  placeholder,
  className,
  disabled,
  'aria-label': ariaLabel,
}: MonthYearFieldProps) {
  const { t } = useTranslation('payroll');
  const [open, setOpen] = React.useState(false);
  const [displayYear, setDisplayYear] = React.useState(() => value?.year ?? now().getFullYear());

  React.useEffect(() => {
    if (open) {
      setDisplayYear(value?.year ?? now().getFullYear());
    }
  }, [open, value]);

  const label =
    value != null
      ? format(fromISO(`${value.year}-${String(value.month).padStart(2, '0')}-01`), 'MMMM yyyy')
      : (placeholder ?? t('overview.month_placeholder'));

  const applyThisMonth = () => {
    const d = now();
    onChange({ year: d.getFullYear(), month: d.getMonth() + 1 });
    setOpen(false);
  };

  const handleClear = () => {
    onClear?.();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          id={id}
          aria-label={ariaLabel ?? t('overview.month_label')}
          className={cn(
            'h-10 w-[11rem] justify-start text-start font-normal shadow-none',
            className,
          )}
        >
          <CalendarDays className="me-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={t('overview.month_picker_prev_year')}
            onClick={() => setDisplayYear((y) => y - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="min-w-[3.5rem] text-center text-sm font-medium tabular-nums">
            {displayYear}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={t('overview.month_picker_next_year')}
            onClick={() => setDisplayYear((y) => y + 1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1 p-2">
          {MONTH_INDEXES.map((m) => {
            const selected = value != null && value.year === displayYear && value.month === m;
            const iso = `${displayYear}-${String(m).padStart(2, '0')}-01`;
            return (
              <Button
                key={m}
                type="button"
                variant={selected ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'h-9 px-1 text-xs font-normal',
                  selected && 'ring-2 ring-foreground/20',
                )}
                onClick={() => {
                  onChange({ year: displayYear, month: m });
                  setOpen(false);
                }}
              >
                {format(fromISO(iso), 'MMM')}
              </Button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-2 py-2 text-sm">
          {onClear ? (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={handleClear}
            >
              {t('overview.month_picker_clear')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={applyThisMonth}
          >
            {t('overview.month_picker_this_month')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

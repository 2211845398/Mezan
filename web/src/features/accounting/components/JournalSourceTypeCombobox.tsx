import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { JOURNAL_SOURCE_TYPES, journalSourceLabel } from '../lib/journalSourceLabel';

const ALL_SOURCES = '__all__';

export type JournalSourceTypeComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  allLabel: string;
};

export function JournalSourceTypeCombobox({
  value,
  onChange,
  disabled,
  className,
  allLabel,
}: JournalSourceTypeComboboxProps) {
  const { t } = useTranslation('accounting');
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const labelText = useMemo(() => {
    if (value === ALL_SOURCES) {
      return allLabel;
    }
    return journalSourceLabel(t, value);
  }, [allLabel, t, value]);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('h-10 w-[200px] justify-between font-normal', className)}
        >
          <span className="min-w-0 truncate text-start">{labelText}</span>
          <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir={i18n.dir()}
        className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command dir={i18n.dir()}>
          <CommandInput placeholder={t('journal.filter.search_source', { defaultValue: 'بحث…' })} />
          <CommandList>
            <CommandEmpty>{t('account_picker.empty')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={ALL_SOURCES}
                onSelect={() => {
                  onChange(ALL_SOURCES);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn('me-2 size-4 shrink-0', value === ALL_SOURCES ? 'opacity-100' : 'opacity-0')}
                />
                {allLabel}
              </CommandItem>
              {JOURNAL_SOURCE_TYPES.map((s) => {
                const label = journalSourceLabel(t, s);
                return (
                  <CommandItem
                    key={s}
                    value={`${s} ${label}`}
                    onSelect={() => {
                      onChange(s);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('me-2 size-4 shrink-0', value === s ? 'opacity-100' : 'opacity-0')}
                    />
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

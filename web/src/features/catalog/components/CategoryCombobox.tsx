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

export type CategoryOption = { id: number; label: string };

type Props = {
  value: number | null;
  onChange: (categoryId: number | null) => void;
  options: CategoryOption[];
  disabled?: boolean;
  className?: string;
  /** Show "all categories" option that sets value to null. */
  allowAll?: boolean;
  allLabel?: string;
};

export function CategoryCombobox({
  value,
  onChange,
  options,
  disabled,
  className,
  allowAll,
  allLabel,
}: Props) {
  const { t } = useTranslation('catalog');
  const { t: tInv } = useTranslation('inventory');
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const labelText = useMemo(() => {
    if (value == null) {
      return allowAll ? (allLabel ?? tInv('stock.filter.all_categories')) : t('products.category_search_placeholder');
    }
    return options.find((c) => c.id === value)?.label ?? t('products.category_search_placeholder');
  }, [allLabel, allowAll, options, t, tInv, value]);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between py-2 text-sm font-normal rtl:flex-row-reverse',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-start">{labelText}</span>
          <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50 rtl:ms-0 rtl:me-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir={i18n.dir()}
        className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command dir={i18n.dir()}>
          <CommandInput placeholder={t('products.category_search_placeholder')} />
          <CommandList>
            <CommandEmpty>{t('products.tags_empty')}</CommandEmpty>
            <CommandGroup>
              {allowAll ? (
                <CommandItem
                  value="__all_categories__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'me-2 size-4 shrink-0',
                      value == null ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {allLabel ?? tInv('stock.filter.all_categories')}
                </CommandItem>
              ) : null}
              {options.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.label}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'me-2 size-4 shrink-0',
                      value === c.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {c.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

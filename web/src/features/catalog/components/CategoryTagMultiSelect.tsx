import { Check, ChevronsUpDown, X } from 'lucide-react';
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

import type { CategoryOption } from './CategoryCombobox';

type Props = {
  valueIds: number[];
  onChange: (ids: number[]) => void;
  options: CategoryOption[];
  disabled?: boolean;
  /** Hide the search trigger (chips-only row). */
  hideTrigger?: boolean;
  /** Hide selected tag chips (trigger-only cell). */
  hideTags?: boolean;
};

export function CategoryTagMultiSelect({
  valueIds,
  onChange,
  options,
  disabled,
  hideTrigger = false,
  hideTags = false,
}: Props) {
  const { t } = useTranslation('catalog');
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const trimmed = search.trim().toLowerCase();
  const available = useMemo(
    () => options.filter((c) => !valueIds.includes(c.id)),
    [options, valueIds],
  );
  const filtered = useMemo(() => {
    if (!trimmed) return available;
    return available.filter((c) => c.label.toLowerCase().includes(trimmed));
  }, [available, trimmed]);

  const selectedLabels = useMemo(() => {
    const byId = new Map(options.map((c) => [c.id, c.label]));
    return valueIds.map((id) => ({ id, label: byId.get(id) ?? String(id) }));
  }, [options, valueIds]);

  const toggle = (id: number) => {
    if (valueIds.includes(id)) {
      onChange(valueIds.filter((x) => x !== id));
    } else {
      onChange([...valueIds, id]);
    }
    setSearch('');
  };

  const remove = (id: number) => {
    onChange(valueIds.filter((x) => x !== id));
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {!hideTrigger ? (
      <Popover modal={false} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || available.length === 0}
            className="h-9 w-full justify-between font-normal"
          >
            <span className="truncate text-muted-foreground">
              {t('products.tags_search_placeholder')}
            </span>
            <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          dir={i18n.dir()}
          className="z-[60] w-[min(100vw-2rem,24rem)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command dir={i18n.dir()} shouldFilter={false}>
            <CommandInput
              placeholder={t('products.tags_search_placeholder')}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{t('products.tags_empty')}</CommandEmpty>
              <CommandGroup>
                {filtered.map((c) => (
                  <CommandItem key={c.id} value={c.label} onSelect={() => toggle(c.id)}>
                    <Check className="me-2 size-4 opacity-0" />
                    {c.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      ) : null}
      {!hideTags && selectedLabels.length > 0 ? (
        <div className="flex flex-wrap justify-start gap-2 rounded-md border bg-background/60 p-3">
          {selectedLabels.map(({ id, label }) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm"
            >
              {label}
              <button
                type="button"
                className="rounded-full hover:bg-primary/15"
                disabled={disabled}
                onClick={() => remove(id)}
                aria-label={label}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

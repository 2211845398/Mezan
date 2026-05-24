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

import type { TaxDefinitionRead } from '../api';

type Props = {
  valueIds: number[];
  onChange: (ids: number[]) => void;
  options: TaxDefinitionRead[];
  disabled?: boolean;
};

export function TaxDefinitionMultiSelect({ valueIds, onChange, options, disabled }: Props) {
  const { t } = useTranslation('catalog');
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const trimmed = search.trim().toLowerCase();
  const available = useMemo(
    () => options.filter((d) => !valueIds.includes(d.id)),
    [options, valueIds],
  );
  const filtered = useMemo(() => {
    if (!trimmed) return available;
    return available.filter((d) => d.name.toLowerCase().includes(trimmed));
  }, [available, trimmed]);

  const selectedItems = useMemo(() => {
    const byId = new Map(options.map((d) => [d.id, d]));
    return valueIds.map((id) => {
      const d = byId.get(id);
      const pct = d ? (Number.parseFloat(String(d.rate)) * 100).toFixed(2) : '';
      return { id, name: d?.name ?? String(id), pct };
    });
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
              {t('products.tax_search_placeholder')}
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
              placeholder={t('products.tax_search_placeholder')}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{t('products.tax.empty_defs')}</CommandEmpty>
              <CommandGroup>
                {filtered.map((d) => {
                  const pct = (Number.parseFloat(String(d.rate)) * 100).toFixed(2);
                  return (
                    <CommandItem
                      key={d.id}
                      value={`${d.name} ${pct}`}
                      onSelect={() => toggle(d.id)}
                    >
                      <Check className="me-2 size-4 opacity-0" />
                      <span>{d.name}</span>
                      <span className="ms-1 num-latin text-muted-foreground">({pct}%)</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedItems.length > 0 ? (
        <div className="flex flex-wrap justify-start gap-2 rounded-md border border-border/60 bg-background/50 p-2">
          {selectedItems.map(({ id, name, pct }) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm"
            >
              <span>{name}</span>
              <span className="num-latin text-muted-foreground">({pct}%)</span>
              <button
                type="button"
                className="rounded-full hover:bg-primary/15"
                disabled={disabled}
                onClick={() => remove(id)}
                aria-label={name}
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

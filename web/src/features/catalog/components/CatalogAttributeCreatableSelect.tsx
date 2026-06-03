import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyApiError } from '@/api/errorMessages';
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

import { createCatalogAttribute, listCatalogAttributes } from '../api';
import { catalogKeys } from '../queries';

type Props = {
  value: number | null;
  excludeAttributeIds?: number[];
  disabled?: boolean | undefined;
  onChange: (attributeId: number) => void;
};

export function CatalogAttributeCreatableSelect({
  value,
  excludeAttributeIds = [],
  disabled,
  onChange,
}: Props) {
  const { t, i18n } = useTranslation('catalog');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: attributes = [], isLoading } = useQuery({
    queryKey: [...catalogKeys.root, 'catalogAttributes'],
    queryFn: listCatalogAttributes,
  });

  const excluded = useMemo(() => new Set(excludeAttributeIds), [excludeAttributeIds]);
  const options = useMemo(
    () => attributes.filter((a) => !excluded.has(a.id) || a.id === value),
    [attributes, excluded, value],
  );

  const selected = options.find((a) => a.id === value);
  const trimmed = search.trim();
  const canCreate =
    trimmed.length > 0 &&
    !options.some((a) => a.name.toLowerCase() === trimmed.toLowerCase());

  const createM = useMutation({
    mutationFn: () => createCatalogAttribute({ name: trimmed }),
    onSuccess: (attr) => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'catalogAttributes'] });
      onChange(attr.id);
      setSearch('');
      setOpen(false);
    },
    onError: (err) => notifyApiError(err, t('errors.generic')),
  });

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full min-w-[10rem] justify-between font-normal"
        >
          <span className="truncate">{selected?.name ?? t('products.axes.pick_attribute')}</span>
          <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir={i18n.dir()}
        className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command dir={i18n.dir()} shouldFilter={false}>
          <CommandInput
            placeholder={tc('layout.search')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{isLoading ? '…' : t('products.axes.no_attributes')}</CommandEmpty>
            <CommandGroup>
              {options.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.name} ${a.code}`}
                  onSelect={() => {
                    onChange(a.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('me-2 size-4', value === a.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {a.name}
                </CommandItem>
              ))}
              {canCreate ? (
                <CommandItem
                  value={`__create__${trimmed}`}
                  onSelect={() => createM.mutate()}
                  disabled={createM.isPending}
                >
                  <Plus className="me-2 size-4" />
                  {t('products.axes.create_attribute', { name: trimmed })}
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

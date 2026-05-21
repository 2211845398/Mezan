import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyApiError } from '@/api/errorMessages';
import { Badge } from '@/components/ui/badge';
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

import { createCatalogAttributeValue, listCatalogAttributeValues } from '../api';
import { catalogKeys } from '../queries';

type Props = {
  attributeId: number;
  valueIds: number[];
  disabled?: boolean;
  onChange: (valueIds: number[]) => void;
};

export function CatalogAttributeValueCreatableMultiSelect({
  attributeId,
  valueIds,
  disabled,
  onChange,
}: Props) {
  const { t, i18n } = useTranslation('catalog');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const valuesKey = [...catalogKeys.root, 'attrValues', attributeId] as const;
  const { data: values = [], isLoading } = useQuery({
    queryKey: valuesKey,
    queryFn: () => listCatalogAttributeValues(attributeId),
    enabled: attributeId > 0,
  });

  const selectedLabels = useMemo(() => {
    const byId = new Map(values.map((v) => [v.id, v.label]));
    return valueIds.map((id) => ({ id, label: byId.get(id) ?? String(id) }));
  }, [valueIds, values]);

  const trimmed = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!trimmed) {
      return values;
    }
    return values.filter(
      (v) =>
        v.label.toLowerCase().includes(trimmed) || v.code.toLowerCase().includes(trimmed),
    );
  }, [values, trimmed]);

  const canCreate =
    trimmed.length > 0 &&
    !values.some((v) => v.label.toLowerCase() === trimmed || v.code.toLowerCase() === trimmed);

  const createM = useMutation({
    mutationFn: () => createCatalogAttributeValue(attributeId, { label: search.trim() }),
    onSuccess: (val) => {
      void qc.invalidateQueries({ queryKey: valuesKey });
      if (!valueIds.includes(val.id)) {
        onChange([...valueIds, val.id]);
      }
      setSearch('');
    },
    onError: (err) => notifyApiError(err, t('errors.generic')),
  });

  const toggle = (id: number) => {
    if (valueIds.includes(id)) {
      onChange(valueIds.filter((x) => x !== id));
    } else {
      onChange([...valueIds, id]);
    }
  };

  const remove = (id: number) => {
    onChange(valueIds.filter((x) => x !== id));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {selectedLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedLabels.map(({ id, label }) => (
            <Badge key={id} variant="secondary" className="gap-1 pe-1">
              {label}
              <button
                type="button"
                className="rounded-full hover:bg-muted"
                disabled={disabled}
                onClick={() => remove(id)}
                aria-label={t('actions.delete')}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <Popover modal={false} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || attributeId <= 0}
            className="h-9 w-full justify-between font-normal"
          >
            <span className="text-muted-foreground truncate">
              {t('products.axes.pick_values')}
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
          <Command
            dir={i18n.dir()}
            shouldFilter={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canCreate && !createM.isPending) {
                e.preventDefault();
                createM.mutate();
              }
            }}
          >
            <CommandInput
              placeholder={tc('layout.search')}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{isLoading ? '…' : t('products.axes.no_values')}</CommandEmpty>
              <CommandGroup>
                {filtered.map((v) => {
                  const picked = valueIds.includes(v.id);
                  return (
                    <CommandItem key={v.id} value={`${v.label} ${v.code}`} onSelect={() => toggle(v.id)}>
                      <Check className={cn('me-2 size-4', picked ? 'opacity-100' : 'opacity-0')} />
                      {v.label}
                    </CommandItem>
                  );
                })}
                {canCreate ? (
                  <CommandItem
                    value={`__create__${search}`}
                    onSelect={() => createM.mutate()}
                    disabled={createM.isPending}
                  >
                    <Plus className="me-2 size-4" />
                    {t('products.axes.create_value', { name: search.trim() })}
                  </CommandItem>
                ) : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

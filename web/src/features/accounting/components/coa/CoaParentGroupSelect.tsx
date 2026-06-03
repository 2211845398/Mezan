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

import type { ChartAccountRead } from '../../api';
import { resolveCoaDisplayName } from '../../lib/coaDisplayName';

type Props = {
  value: number | null;
  onChange: (parentId: number | null) => void;
  options: ChartAccountRead[];
  disabled?: boolean;
  required?: boolean;
};

export function CoaParentGroupSelect({
  value,
  onChange,
  options,
  disabled,
  required,
}: Props) {
  const { t } = useTranslation('accounting');
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const labelText = useMemo(() => {
    if (value == null) {
      return required ? t('coa.parent_required') : t('coa.parent_none');
    }
    const opt = options.find((o) => o.id === value);
    return opt
      ? `${opt.code} · ${resolveCoaDisplayName(opt, i18n.language)}`
      : t('coa.parent_placeholder');
  }, [options, required, t, value, i18n.language]);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between py-2 text-sm font-normal rtl:flex-row-reverse"
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
          <CommandInput placeholder={t('coa.parent_search')} />
          <CommandList>
            <CommandEmpty>{t('coa.parent_empty')}</CommandEmpty>
            <CommandGroup>
              {!required ? (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('me-2 size-4', value == null ? 'opacity-100' : 'opacity-0')} />
                  {t('coa.parent_none')}
                </CommandItem>
              ) : null}
              {options.map((opt) => {
                const label = resolveCoaDisplayName(opt, i18n.language);
                return (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.code} ${label}`}
                    onSelect={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('me-2 size-4', value === opt.id ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="font-mono text-xs text-muted-foreground">{opt.code}</span>
                    <span className="ms-2">{label}</span>
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

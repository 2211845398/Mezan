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
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MEZ_COMBOBOX_BORDER_CLASS } from '@/lib/fieldFocus';
import { cn } from '@/lib/utils';

import { getBranchLabel } from '../lib/branchLabels';
import { useBranches } from '../queries';
import type { BranchRead } from '../types';

const NO_BRANCH = '__no_branch__';

export type BranchComboboxProps = {
  value: number | null | undefined;
  onChange: (branchId: number | null) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  id?: string;
  /** Allow clearing branch (null). */
  allowClear?: boolean;
  /** Label for the cleared / all-branches option. */
  clearLabel?: string;
  includeArchived?: boolean;
  /** Show branch code under name in the dropdown (default true). */
  showCode?: boolean;
  /** Highlight trigger when validation failed. */
  invalid?: boolean;
};

export function BranchCombobox({
  value,
  onChange,
  disabled,
  className,
  label,
  id,
  allowClear,
  clearLabel,
  includeArchived = false,
  showCode = true,
  invalid = false,
}: BranchComboboxProps) {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: branches = [], isLoading } = useBranches(includeArchived);

  const labelText = useMemo(() => {
    if (value == null || value === 0) {
      return allowClear
        ? (clearLabel ?? t('branches.picker_clear'))
        : t('branches.picker_placeholder');
    }
    const branch = branches.find((b) => b.id === value);
    if (!branch) return `#${value}`;
    return showCode ? getBranchLabel(branches, value) : branch.name;
  }, [allowClear, branches, clearLabel, showCode, t, value]);

  return (
    <div className={cn('space-y-2', className)}>
      {label ? (
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
      ) : null}
      <Popover modal={false} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || isLoading}
            aria-invalid={invalid || undefined}
            className={cn(
              'h-auto min-h-10 w-full justify-between py-2 font-normal rtl:flex-row-reverse',
              MEZ_COMBOBOX_BORDER_CLASS,
            )}
          >
            <span className="min-w-0 flex-1 text-start">{isLoading ? '…' : labelText}</span>
            <ChevronsUpDown className="ms-2 size-4 shrink-0 self-start opacity-50 rtl:ms-0 rtl:me-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          dir={i18n.dir()}
          className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command dir={i18n.dir()}>
            <CommandInput placeholder={tc('layout.search')} />
            <CommandList>
              <CommandEmpty>{isLoading ? '…' : t('branches.empty')}</CommandEmpty>
              <CommandGroup>
                {allowClear ? (
                  <CommandItem
                    value={NO_BRANCH}
                    className="gap-2 rtl:flex-row-reverse"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0',
                        value == null || value === 0 ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="flex-1 text-start">{clearLabel ?? t('branches.picker_clear')}</span>
                  </CommandItem>
                ) : null}
                {branches.map((b: BranchRead) => {
                  const blob = `${b.id} ${b.code ?? ''} ${b.name} ${getBranchLabel(branches, b.id)}`;
                  return (
                    <CommandItem
                      key={b.id}
                      value={blob}
                      className="gap-2 rtl:flex-row-reverse"
                      onSelect={() => {
                        onChange(b.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'size-4 shrink-0',
                          value === b.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
                        <span className="leading-tight">{b.name}</span>
                        {showCode && b.code ? (
                          <span className="text-xs text-muted-foreground">{b.code}</span>
                        ) : null}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

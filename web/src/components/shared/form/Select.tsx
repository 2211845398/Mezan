import * as React from 'react';

import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  Select as SelectRoot,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/*
 * Controlled-only `<Select />` adapter. Feature code binds it to RHF via
 *
 *   <Controller
 *     control={form.control}
 *     name="branch_id"
 *     render={({ field }) => (
 *       <Select
 *         value={field.value}
 *         onChange={field.onChange}
 *         options={branches}
 *       />
 *     )}
 *   />
 */

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  value: string | undefined;
  onChange: (next: string) => void;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
  id,
  disabled,
  'aria-label': ariaLabel,
}: SelectProps) {
  return (
    <UiSelect
      value={value ?? ''}
      onValueChange={onChange}
      {...(disabled !== undefined ? { disabled } : {})}
    >
      <SelectTrigger
        {...(id !== undefined ? { id } : {})}
        {...(className !== undefined ? { className } : {})}
        {...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {})}
      >
        <SelectValue {...(placeholder !== undefined ? { placeholder } : {})} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            {...(opt.disabled ? { disabled: true } : {})}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </UiSelect>
  );
}

/**
 * Async-search variant. The consumer supplies an `onSearch` callback and an
 * up-to-date `options` list (typically derived from a TanStack Query). The
 * component renders shadcn's `Command` inside a popover.
 */

import { Check, ChevronDown, X } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type AsyncSelectProps = {
  value: string | undefined;
  onChange: (next: string) => void;
  options: ReadonlyArray<SelectOption>;
  onSearch: (query: string) => void;
  placeholder?: string | undefined;
  searchPlaceholder?: string | undefined;
  emptyLabel?: string | undefined;
  isLoading?: boolean | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
  /** Shown when value is set but the option is not in the current options list. */
  displayLabel?: string | undefined;
  /** Show clear (X) control when a value is selected. */
  clearable?: boolean | undefined;
  clearAriaLabel?: string | undefined;
  /** When false (default), rely on server-side search; do not filter Command items locally. */
  filterLocally?: boolean | undefined;
};

export function AsyncSelect({
  value,
  onChange,
  options,
  onSearch,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No results',
  isLoading = false,
  className,
  disabled = false,
  displayLabel,
  clearable = false,
  clearAriaLabel = 'Clear',
  filterLocally = false,
}: AsyncSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selected = options.find((o) => o.value === value);
  const hasValue = value != null && value !== '';
  const triggerLabel =
    (displayLabel?.trim() ? displayLabel : selected?.label) ??
    (hasValue ? value : undefined) ??
    placeholder;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center gap-1 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={cn('min-w-0 flex-1 truncate text-start', !hasValue && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          {clearable && hasValue && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={clearAriaLabel}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange('');
                setQuery('');
                onSearch('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange('');
                  setQuery('');
                  onSearch('');
                }
              }}
            >
              <X className="size-3.5" aria-hidden />
            </span>
          ) : null}
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={filterLocally}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              onSearch(v);
            }}
          />
          <CommandList>
            <CommandEmpty>{isLoading ? '…' : emptyLabel}</CommandEmpty>
            {options.map((opt) => (
              <CommandItem
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled ?? false}
                onSelect={(v) => {
                  onChange(v);
                  setOpen(false);
                }}
              >
                <Check
                  aria-hidden="true"
                  className={cn('me-2 size-4', value === opt.value ? 'opacity-100' : 'opacity-0')}
                />
                {opt.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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

import { useOnboardingAssignees, useUser } from '../queries';
import type { UserRead } from '../types';

type Props = {
  /** Selected user id as string, or empty string for none */
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  className?: string;
};

function userPrimaryLabel(u: UserRead): string {
  const n = (u.full_name ?? '').trim();
  if (n) return n;
  return u.email;
}

export function HrAssigneeCombobox({ value, onChange, disabled, className }: Props) {
  const { t, i18n } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const listEnabled = !disabled && (open || value !== '');
  const { data: assignees = [], isLoading } = useOnboardingAssignees({ enabled: listEnabled });

  const selectedId = useMemo(() => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [value]);

  const { data: fallbackUser } = useUser(selectedId ?? 0, {
    enabled: Boolean(
      selectedId &&
        !assignees.some((u) => u.id === selectedId) &&
        listEnabled &&
        !disabled,
    ),
  });

  const sorted = useMemo(
    () =>
      [...assignees].sort((a, b) =>
        userPrimaryLabel(a).localeCompare(userPrimaryLabel(b), undefined, { sensitivity: 'base' }),
      ),
    [assignees],
  );

  const selected = useMemo(() => {
    const fromList = sorted.find((u) => String(u.id) === value);
    if (fromList) return fromList;
    if (selectedId != null && fallbackUser?.id === selectedId) return fallbackUser;
    return undefined;
  }, [sorted, value, selectedId, fallbackUser]);

  const label = selected ? (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0 text-start">
      <span className="min-w-0 truncate">{userPrimaryLabel(selected)}</span>
      <span dir="ltr" className="shrink-0 font-normal tabular-nums text-muted-foreground">
        #{selected.id}
      </span>
    </span>
  ) : (
    t('users.hr_user_pick')
  );

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled ?? false}
          className={cn(
            'h-auto min-h-10 w-full justify-between py-2 font-normal rtl:flex-row-reverse',
            className ?? '',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-start">
            {isLoading && value ? '…' : label}
          </span>
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
          <CommandInput placeholder={tc('layout.search')} />
          <CommandList>
            <CommandEmpty>{isLoading ? '…' : t('users.hr_assignee_empty')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <Check className={cn('me-2 size-4 shrink-0', value === '' ? 'opacity-100' : 'opacity-0')} />
                {t('branches.picker_clear')}
              </CommandItem>
              {sorted.map((u) => {
                const idStr = String(u.id);
                const primary = userPrimaryLabel(u);
                return (
                  <CommandItem
                    key={u.id}
                    value={`${idStr} ${u.email} ${primary}`}
                    onSelect={() => {
                      onChange(idStr);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('me-2 size-4 shrink-0', value === idStr ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
                      <span className="truncate font-medium">{primary}</span>
                      <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">#{u.id}</span>
                    </div>
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

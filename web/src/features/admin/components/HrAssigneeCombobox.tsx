import { useQueries } from '@tanstack/react-query';
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
import { HR_ASSIGNEE_ELIGIBLE_ROLE_CODES } from '@/config/hrAssigneeRoleCodes';
import { cn } from '@/lib/utils';

import { getUserRoles } from '../api';
import { adminKeys, useUsersList } from '../queries';
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
  const { data: users = [], isLoading } = useUsersList({ enabled: open || value !== '' });

  const sorted = useMemo(
    () =>
      [...users].sort((a, b) =>
        userPrimaryLabel(a).localeCompare(userPrimaryLabel(b), undefined, { sensitivity: 'base' }),
      ),
    [users],
  );

  const roleQueries = useQueries({
    queries: users.map((u) => ({
      queryKey: adminKeys.userRoles(u.id),
      queryFn: () => getUserRoles(u.id),
      enabled: !disabled && (open || value !== '') && users.length > 0,
      staleTime: 60_000,
    })),
  });

  const eligibleIds = useMemo(() => {
    const ids = new Set<number>();
    users.forEach((u, i) => {
      const rows = roleQueries[i]?.data;
      if (!rows) return;
      if (rows.some((r) => HR_ASSIGNEE_ELIGIBLE_ROLE_CODES.has(r.role_code))) ids.add(u.id);
    });
    return ids;
  }, [users, roleQueries]);

  const rolesStillLoading =
    users.length > 0 && roleQueries.some((q) => q.isLoading || q.isFetching);

  const filteredSorted = useMemo(
    () => sorted.filter((u) => eligibleIds.has(u.id)),
    [sorted, eligibleIds],
  );

  const selected = useMemo(() => sorted.find((u) => String(u.id) === value), [sorted, value]);

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
            <CommandEmpty>
              {rolesStillLoading || isLoading ? '…' : t('users.hr_assignee_empty')}
            </CommandEmpty>
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
              {filteredSorted.map((u) => {
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

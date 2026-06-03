import { ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { useBranches } from '../queries';
import type { BranchRead } from '../types';

type Props = {
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  label?: string;
  includeArchived?: boolean;
};

export function BranchIdsMultiPicker({
  value,
  onChange,
  disabled,
  label,
  includeArchived = false,
}: Props) {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const { data: branches = [], isLoading } = useBranches(includeArchived);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const summary = useMemo(() => {
    if (value.length === 0) return t('notifications.branches_all');
    if (value.length === 1) {
      const b = branches.find((x: BranchRead) => x.id === value[0]);
      return b ? `${b.code} — ${b.name}` : String(value[0]);
    }
    return t('notifications.branches_count', { count: value.length });
  }, [branches, t, value]);

  function toggle(id: number, checked: boolean) {
    if (checked) {
      if (!selectedSet.has(id)) onChange([...value, id]);
    } else {
      onChange(value.filter((x) => x !== id));
    }
  }

  return (
    <div className="space-y-2">
      {label ? <Label>{label}</Label> : null}
      <Popover modal={false} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled || isLoading}
            className="h-auto min-h-10 w-full justify-between py-2 font-normal rtl:flex-row-reverse"
          >
            <span className="min-w-0 flex-1 truncate text-start">{isLoading ? '…' : summary}</span>
            <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50 rtl:ms-0 rtl:me-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-72 overflow-y-auto p-2">
            <button
              type="button"
              className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted"
              onClick={() => {
                onChange([]);
              }}
            >
              <Checkbox checked={value.length === 0} className="pointer-events-none" />
              {t('branches.picker_clear')}
            </button>
            {branches.map((b: BranchRead) => {
              const checked = selectedSet.has(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted',
                  )}
                  onClick={() => toggle(b.id, !checked)}
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="min-w-0 flex-1 truncate">
                    {b.code} — {b.name}
                    {b.archived_at ? ` (${t('branches.archived_badge')})` : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">{tc('notifications.branches_hint')}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

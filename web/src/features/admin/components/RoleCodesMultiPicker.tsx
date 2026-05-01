import { ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { roleCodeLabel } from '../lib/roleLabels';
import { useRoles } from '../queries';
import type { RoleWithPermissions } from '../types';

type RoleRow = RoleWithPermissions & { code: string };

function pickRoles(roles: RoleWithPermissions[]): RoleRow[] {
  return roles.filter((r): r is RoleRow => (r.code ?? '').length > 0);
}

type Props = {
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  label?: string;
};

export function RoleCodesMultiPicker({ value, onChange, disabled, label }: Props) {
  const { t, i18n } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const hideTechnicalRoleCode = i18n.language.startsWith('ar');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const valueActive = value.length > 0;
  const { data: roles = [], isLoading } = useRoles({ enabled: open || valueActive });
  const rolesWithCode = useMemo(() => pickRoles(roles), [roles]);
  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rolesWithCode;
    return rolesWithCode.filter((r) => {
      const title = roleCodeLabel(t, r.code, r.name).toLowerCase();
      return r.code.toLowerCase().includes(s) || (r.name ?? '').toLowerCase().includes(s) || title.includes(s);
    });
  }, [q, rolesWithCode, t]);

  const summary = useMemo(() => {
    if (value.length === 0) return t('notifications.roles_pick');
    if (value.length === 1) {
      const r = rolesWithCode.find((x) => x.code === value[0]);
      return roleCodeLabel(t, value[0], r?.name ?? null);
    }
    return t('notifications.roles_count', { count: value.length });
  }, [rolesWithCode, t, value]);

  function toggle(code: string, checked: boolean) {
    if (checked) {
      if (!selectedSet.has(code)) onChange([...value, code]);
    } else {
      onChange(value.filter((c) => c !== code));
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
            <span className="min-w-0 flex-1 truncate text-start">{isLoading && valueActive ? '…' : summary}</span>
            <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50 rtl:ms-0 rtl:me-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          dir={i18n.dir()}
          className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b p-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tc('layout.search')}
              className="h-9"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            <button
              type="button"
              className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted"
              onClick={() => onChange([])}
            >
              <Checkbox checked={value.length === 0} className="pointer-events-none" />
              {t('notifications.roles_clear')}
            </button>
            {filtered.map((r) => {
              const code = r.code;
              const checked = selectedSet.has(code);
              const title = roleCodeLabel(t, code, r.name);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted')}
                  onClick={() => toggle(code, !checked)}
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="min-w-0 flex-1">
                    <span className="block leading-tight">{title}</span>
                    {!hideTechnicalRoleCode ? (
                      <span dir="ltr" className="block font-mono text-xs text-muted-foreground">
                        {code}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">{tc('notifications.roles_hint')}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

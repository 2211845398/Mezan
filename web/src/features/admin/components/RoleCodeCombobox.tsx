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
import { MEZ_COMBOBOX_BORDER_CLASS } from '@/lib/fieldFocus';
import { cn } from '@/lib/utils';

import { roleCodeLabel } from '../lib/roleLabels';
import { useRoles } from '../queries';
import type { RoleWithPermissions } from '../types';

type RoleRow = RoleWithPermissions & { code: string };

type RoleComboboxBase = {
  disabled?: boolean;
  className?: string;
  invalid?: boolean;
};

type RoleComboboxByCode = RoleComboboxBase & {
  kind: 'code';
  value: string;
  onChange: (code: string) => void;
};

type RoleComboboxByRoleId = RoleComboboxBase & {
  kind: 'roleId';
  /** Empty string or numeric role id */
  value: string;
  onChange: (roleId: string) => void;
};

export type RoleComboboxProps = RoleComboboxByCode | RoleComboboxByRoleId;

function useRolesWithCode(open: boolean, valueActive: boolean) {
  return useRoles({ enabled: open || valueActive });
}

function pickRoles(roles: RoleWithPermissions[]): RoleRow[] {
  return roles.filter((r): r is RoleRow => (r.code ?? '').length > 0);
}

export function RoleCombobox(props: RoleComboboxProps) {
  const { t, i18n } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  /** Arabic UI: show localized role title only; English code is still sent to the API and searchable. */
  const hideTechnicalRoleCode = i18n.language.startsWith('ar');
  const [open, setOpen] = useState(false);
  const valueActive = props.kind === 'code' ? props.value !== '' : props.value !== '';
  const { data: roles = [], isLoading } = useRolesWithCode(open, valueActive);

  const rolesWithCode = useMemo(() => pickRoles(roles), [roles]);

  const selected = useMemo(() => {
    if (props.kind === 'code') {
      return rolesWithCode.find((r) => r.code === props.value);
    }
    return rolesWithCode.find((r) => String(r.id) === props.value);
  }, [props, rolesWithCode]);

  const labelText = useMemo(() => {
    if (props.kind === 'code') {
      if (!props.value) return t('users.pick_role');
      const code = selected?.code ?? props.value;
      return roleCodeLabel(t, code, selected?.name ?? null);
    }
    if (!props.value) return t('users.pick_role');
    const code = selected?.code;
    if (!code) return props.value;
    return roleCodeLabel(t, code, selected?.name ?? null);
  }, [props, selected, t]);

  const label = (
    <span className="flex min-w-0 flex-col items-stretch gap-0.5 text-start">
      <span className="truncate font-medium leading-tight">{labelText}</span>
      {!hideTechnicalRoleCode && selected?.code ? (
        <span dir="ltr" className="truncate font-mono text-xs text-muted-foreground">
          {selected.code}
        </span>
      ) : null}
      {!hideTechnicalRoleCode && !selected?.code && props.kind === 'code' && props.value ? (
        <span dir="ltr" className="truncate font-mono text-xs text-muted-foreground">
          {props.value}
        </span>
      ) : null}
    </span>
  );

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={props.disabled ?? false}
          aria-invalid={props.invalid || undefined}
          className={cn(
            'h-auto min-h-10 w-full justify-between py-2 font-normal rtl:flex-row-reverse',
            MEZ_COMBOBOX_BORDER_CLASS,
            props.className,
          )}
        >
          <span className="min-w-0 flex-1">{isLoading && valueActive ? '…' : label}</span>
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
            <CommandEmpty>{isLoading ? '…' : t('roles.empty')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  props.onChange('');
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'me-2 size-4 shrink-0',
                    (props.kind === 'code' ? props.value === '' : props.value === '') ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {t('branches.picker_clear')}
              </CommandItem>
              {rolesWithCode.map((r) => {
                const code = r.code;
                const title = roleCodeLabel(t, code, r.name);
                const searchBlob = `${code} ${r.name} ${title}`;
                return (
                  <CommandItem
                    key={r.id}
                    value={searchBlob}
                    onSelect={() => {
                      if (props.kind === 'code') props.onChange(code);
                      else props.onChange(String(r.id));
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'me-2 size-4 shrink-0',
                        props.kind === 'code'
                          ? props.value === code
                            ? 'opacity-100'
                            : 'opacity-0'
                          : props.value === String(r.id)
                            ? 'opacity-100'
                            : 'opacity-0',
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
                      <span className="leading-tight">{title}</span>
                      {!hideTechnicalRoleCode ? (
                        <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                          {code}
                        </span>
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
  );
}

export type RoleCodeComboboxProps = Omit<RoleComboboxByCode, 'kind'> & {
  invalid?: boolean;
};

export function RoleCodeCombobox({
  value,
  onChange,
  disabled,
  className,
  invalid = false,
}: RoleCodeComboboxProps) {
  return (
    <RoleCombobox
      kind="code"
      value={value}
      onChange={onChange}
      disabled={disabled ?? false}
      className={className}
      invalid={invalid}
    />
  );
}

export type RoleIdComboboxProps = Omit<RoleComboboxByRoleId, 'kind'>;

export function RoleIdCombobox({ value, onChange, disabled, className }: RoleIdComboboxProps) {
  return (
    <RoleCombobox kind="roleId" value={value} onChange={onChange} disabled={disabled ?? false} className={className ?? ''} />
  );
}

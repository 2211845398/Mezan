import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import type { PermissionRead } from '../types';

type Props = {
  permissions: PermissionRead[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  /** When true, outer scroll is handled by parent (e.g. floating dialog body). */
  embedInScrollContainer?: boolean;
};

export function PermissionGrid({
  permissions,
  selectedIds,
  onChange,
  disabled,
  readOnly,
  embedInScrollContainer,
}: Props) {
  const { t } = useTranslation('admin');
  const set = new Set(selectedIds);

  const byResource = useMemo(() => {
    const m = new Map<string, PermissionRead[]>();
    for (const p of permissions) {
      const g = m.get(p.resource) ?? [];
      g.push(p);
      m.set(p.resource, g);
    }
    for (const g of m.values()) g.sort((a, b) => a.action.localeCompare(b.action));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  function toggle(id: number, next: boolean) {
    if (readOnly) return;
    if (next) onChange([...new Set([...selectedIds, id])]);
    else onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div
      className={cn(
        'space-y-6 pe-1',
        embedInScrollContainer ? 'overflow-visible' : 'max-h-[min(70vh,520px)] overflow-y-auto',
      )}
    >
      {byResource.map(([resource, perms]) => (
        <div key={resource} className="space-y-3">
          <div className="border-b border-border pb-3">
            <p className="text-muted-foreground text-sm font-medium">{resource}</p>
          </div>
          <ul className={cn('grid gap-2 sm:grid-cols-2')}>
            {perms.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-md border p-2 text-sm"
              >
                <Checkbox
                  id={`perm-${p.id}`}
                  checked={set.has(p.id)}
                  onCheckedChange={(c) => toggle(p.id, c === true)}
                  disabled={disabled || readOnly}
                />
                <Label htmlFor={`perm-${p.id}`} className="cursor-pointer font-normal">
                  {p.action}
                </Label>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {byResource.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('roles.no_permissions')}</p>
      ) : null}
    </div>
  );
}

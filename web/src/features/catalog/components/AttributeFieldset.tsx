import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import type { AttrDef } from '../api';

type AttrFormValues = { attributes: Record<string, unknown> };

type AttributeFieldsetProps = {
  defs: AttrDef[] | undefined;
  /** Category id — seed missing keys when it changes. */
  categoryId: number | null;
  /** Tighter controls for dense forms (e.g. product form). */
  compact?: boolean;
};

function setKey(
  prev: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return { ...prev, [key]: value };
}

/**
 * Renders category attribute definitions into RHF `attributes` object keys.
 */
export function AttributeFieldset({ defs, categoryId, compact }: AttributeFieldsetProps) {
  const { setValue, watch } = useFormContext<AttrFormValues>();
  const attributes = (watch('attributes') ?? {}) as Record<string, unknown>;
  const inputClass = compact ? 'h-8 text-sm' : undefined;
  const labelClass = compact ? 'text-sm' : undefined;

  useEffect(() => {
    if (categoryId == null) {
      return;
    }
    const next: Record<string, unknown> = { ...attributes };
    for (const d of defs ?? []) {
      if (!(d.key in next)) {
        if (d.type.toLowerCase() === 'bool' || d.type.toLowerCase() === 'boolean') {
          next[d.key] = false;
        } else {
          next[d.key] = '';
        }
      }
    }
    setValue('attributes', next, { shouldDirty: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, defs, setValue]);

  if (!defs?.length) {
    return null;
  }

  const selectOptionsFromDef = (d: AttrDef): string[] => {
    const o = d.options as { values?: unknown; choices?: unknown } | null | undefined;
    const raw = o?.values ?? o?.choices;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === 'string');
  };

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {defs
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((d) => {
          const t = d.type.toLowerCase();
          return (
            <div key={d.id} className="space-y-1">
              <Label htmlFor={`attr-${d.key}`} className={labelClass}>
                {d.label}
                {d.required ? ' *' : ''}
              </Label>
              {t === 'bool' || t === 'boolean' ? (
                <div className="flex items-center gap-2">
                  <Switch
                    id={`attr-${d.key}`}
                    checked={Boolean(attributes[d.key])}
                    onCheckedChange={(v) =>
                      setValue('attributes', setKey(attributes, d.key, v), { shouldDirty: true })
                    }
                  />
                </div>
              ) : t === 'int' || t === 'integer' ? (
                <Input
                  id={`attr-${d.key}`}
                  className={inputClass}
                  type="number"
                  step={1}
                  value={
                    typeof attributes[d.key] === 'number'
                      ? (attributes[d.key] as number)
                      : (attributes[d.key] as string | number | undefined) ?? ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setValue(
                      'attributes',
                      setKey(attributes, d.key, v === '' ? '' : Number.parseInt(v, 10)),
                      { shouldDirty: true },
                    );
                  }}
                />
              ) : t === 'float' || t === 'number' ? (
                <Input
                  id={`attr-${d.key}`}
                  className={inputClass}
                  type="number"
                  step="any"
                  value={
                    typeof attributes[d.key] === 'number'
                      ? (attributes[d.key] as number)
                      : (attributes[d.key] as string | number | undefined) ?? ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setValue(
                      'attributes',
                      setKey(attributes, d.key, v === '' ? '' : Number.parseFloat(v)),
                      { shouldDirty: true },
                    );
                  }}
                />
              ) : t === 'date' ? (
                <Input
                  id={`attr-${d.key}`}
                  className={inputClass}
                  type="date"
                  value={String(attributes[d.key] ?? '')}
                  onChange={(e) =>
                    setValue('attributes', setKey(attributes, d.key, e.target.value), { shouldDirty: true })
                  }
                />
              ) : t === 'select' || t === 'enum' ? (
                (() => {
                  const opts = selectOptionsFromDef(d);
                  if (!opts.length) {
                    return (
                      <Input
                        id={`attr-${d.key}`}
                        className={inputClass}
                        type="text"
                        value={String(attributes[d.key] ?? '')}
                        onChange={(e) =>
                          setValue('attributes', setKey(attributes, d.key, e.target.value), {
                            shouldDirty: true,
                          })
                        }
                      />
                    );
                  }
                  const EMPTY = '__none__';
                  const cur = attributes[d.key];
                  const inOpts = typeof cur === 'string' && opts.includes(cur);
                  const val =
                    cur === '' || cur == null
                      ? !d.required
                        ? EMPTY
                        : (opts[0] ?? '')
                      : inOpts
                        ? String(cur)
                        : !d.required
                          ? EMPTY
                          : (opts[0] ?? String(cur));
                  return (
                    <Select
                      value={val}
                      onValueChange={(v) =>
                        setValue(
                          'attributes',
                          setKey(attributes, d.key, v === EMPTY ? '' : v),
                          { shouldDirty: true },
                        )
                      }
                    >
                      <SelectTrigger id={`attr-${d.key}`} className={cn(compact && 'h-8 text-sm')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {!d.required ? <SelectItem value={EMPTY}>—</SelectItem> : null}
                        {opts.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                })()
              ) : (
                <Input
                  id={`attr-${d.key}`}
                  className={inputClass}
                  type="text"
                  value={String(attributes[d.key] ?? '')}
                  onChange={(e) =>
                    setValue('attributes', setKey(attributes, d.key, e.target.value), { shouldDirty: true })
                  }
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

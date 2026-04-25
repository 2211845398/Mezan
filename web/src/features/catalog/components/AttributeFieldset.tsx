import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import type { AttrDef } from '../api';

type AttrFormValues = { attributes: Record<string, unknown> };

type AttributeFieldsetProps = {
  defs: AttrDef[] | undefined;
  /** Category id — seed missing keys when it changes. */
  categoryId: number | null;
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
export function AttributeFieldset({ defs, categoryId }: AttributeFieldsetProps) {
  const { setValue, watch } = useFormContext<AttrFormValues>();
  const attributes = (watch('attributes') ?? {}) as Record<string, unknown>;

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

  return (
    <div className="space-y-4">
      {defs
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((d) => {
          const t = d.type.toLowerCase();
          return (
            <div key={d.id} className="space-y-1">
              <Label htmlFor={`attr-${d.key}`}>
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
              ) : (
                <Input
                  id={`attr-${d.key}`}
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

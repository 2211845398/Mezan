import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

import {
  type CategoryAttrDef,
  createCategoryAttribute,
  deleteCategoryAttribute,
  updateCategoryAttribute,
} from '../api';
import { catalogKeys } from '../queries';

/** Maps to API `sort_order`; lower sorts first. */
export const DISPLAY_PRIORITY_SORT = { high: 0, mid: 50, low: 100 } as const;

export type DisplayPriority = keyof typeof DISPLAY_PRIORITY_SORT;

export const CATEGORY_ATTR_PRESET_KEYS = [
  'COLOR',
  'SIZE',
  'EXPIRATION_DATE',
  'WEIGHT',
  'VOLUME',
  'LENGTH',
  'WIDTH',
  'CAPACITY',
] as const;

export type CategoryAttrPresetKey = (typeof CATEGORY_ATTR_PRESET_KEYS)[number];

type PresetSpec = {
  key: CategoryAttrPresetKey;
  /** Default field type when adding this property */
  type: 'text' | 'float' | 'date' | 'select';
};

export const CATEGORY_ATTR_PRESETS: readonly PresetSpec[] = [
  { key: 'COLOR', type: 'text' },
  { key: 'SIZE', type: 'select' },
  { key: 'EXPIRATION_DATE', type: 'date' },
  { key: 'WEIGHT', type: 'float' },
  { key: 'VOLUME', type: 'float' },
  { key: 'LENGTH', type: 'float' },
  { key: 'WIDTH', type: 'float' },
  { key: 'CAPACITY', type: 'float' },
];

export function sortOrderToPriority(sortOrder: number): DisplayPriority {
  if (sortOrder <= 25) return 'high';
  if (sortOrder <= 75) return 'mid';
  return 'low';
}

function selectOptionsPreview(d: CategoryAttrDef): string {
  const o = d.options as { values?: unknown; choices?: unknown } | null | undefined;
  const raw = o?.values ?? o?.choices;
  if (!Array.isArray(raw)) return '';
  return raw.filter((x): x is string => typeof x === 'string').join(', ');
}

function normalizeAttrType(type: string): string {
  const low = type.toLowerCase();
  if (low === 'integer') return 'int';
  if (low === 'boolean') return 'bool';
  if (low === 'number' || low === 'decimal') return 'float';
  if (low === 'enum') return 'select';
  return low;
}

function attrTypeLabel(t: (k: string) => string, type: string): string {
  const key = normalizeAttrType(type);
  const tr = t(`categories.attr_types.${key}`);
  return tr === `categories.attr_types.${key}` ? type : tr;
}

/** Same chip look for key / type / required row (muted surface, dark text). */
const attrListBadgeClass =
  'border-border bg-muted/50 font-normal text-foreground shadow-none hover:bg-muted/60';

type CategoryAttributeFormProps = {
  categoryId: number;
  defs: CategoryAttrDef[];
  canUpdate: boolean;
};

export function CategoryAttributeForm({ categoryId, defs, canUpdate }: CategoryAttributeFormProps) {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const sorted = useMemo(
    () => defs.slice().sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key)),
    [defs],
  );

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryAttrDef | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState('text');
  const [editRequired, setEditRequired] = useState(false);
  const [editPriority, setEditPriority] = useState<DisplayPriority>('high');
  const [editOptionsCsv, setEditOptionsCsv] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<CategoryAttrDef | null>(null);

  useEffect(() => {
    setEditOpen(false);
    setEditing(null);
    setDeleteTarget(null);
  }, [categoryId]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: catalogKeys.root });

  const ownDefs = useMemo(
    () => sorted.filter((d) => d.is_inherited !== true),
    [sorted],
  );
  const inheritedDefs = useMemo(
    () => sorted.filter((d) => d.is_inherited === true),
    [sorted],
  );

  const openEdit = (d: CategoryAttrDef) => {
    setEditing(d);
    setEditLabel(d.label);
    setEditType(normalizeAttrType(d.type));
    setEditRequired(d.required);
    setEditPriority(sortOrderToPriority(d.sort_order ?? 0));
    setEditOptionsCsv(selectOptionsPreview(d) || '');
    setEditOpen(true);
  };

  const saveEditM = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('no edit');
      const values =
        editType === 'select'
          ? editOptionsCsv
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      return updateCategoryAttribute(categoryId, editing.id, {
        label: editLabel.trim(),
        type: editType,
        required: editRequired,
        sort_order: DISPLAY_PRIORITY_SORT[editPriority],
        options: editType === 'select' && values.length ? { values } : null,
      });
    },
    onSuccess: async () => {
      setEditOpen(false);
      setEditing(null);
      await invalidate();
      toast.success(t('categories.attr_updated'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {ownDefs.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('categories.attr_own')}</p>
            <div className="space-y-3">
              {ownDefs.map((d) => {
                const opts = selectOptionsPreview(d);
                const pri = sortOrderToPriority(d.sort_order ?? 0);
                const priLabel = t(`categories.attr_priority_${pri}`);
                return (
                  <div
                    key={d.id}
                    className={cn(
                      'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between',
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium leading-tight">{d.label}</p>
                        <Badge variant="outline" className={cn('font-mono text-xs', attrListBadgeClass)}>
                          {d.key}
                        </Badge>
                        <Badge variant="outline" className={attrListBadgeClass}>
                          {attrTypeLabel(t, d.type)}
                        </Badge>
                        <Badge variant="outline" className={attrListBadgeClass}>
                          {d.required ? t('categories.attr_required') : t('categories.attr_optional')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('categories.attr_display_priority')}: {priLabel}
                        {opts ? ` · ${t('categories.attr_options')}: ${opts}` : null}
                      </p>
                    </div>
                    {canUpdate ? (
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(d)}>
                          <Pencil className="me-1 size-3" />
                          {t('actions.open')}
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteTarget(d)}>
                          <Trash2 className="me-1 size-3" />
                          {t('actions.delete')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {inheritedDefs.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('categories.attr_inherited')}</p>
            <p className="text-xs text-muted-foreground">{t('categories.attr_inherited_hint')}</p>
            <div className="space-y-3">
              {inheritedDefs.map((d) => {
                const opts = selectOptionsPreview(d);
                const pri = sortOrderToPriority(d.sort_order ?? 0);
                const priLabel = t(`categories.attr_priority_${pri}`);
                return (
                  <div
                    key={`${d.id}-inherited-${d.category_id}`}
                    className={cn(
                      'flex flex-col gap-3 rounded-lg border border-dashed bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between',
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium leading-tight">{d.label}</p>
                        <Badge variant="outline" className={attrListBadgeClass}>
                          {t('categories.attr_inherited_badge')}
                        </Badge>
                        <Badge variant="outline" className={cn('font-mono text-xs', attrListBadgeClass)}>
                          {d.key}
                        </Badge>
                        <Badge variant="outline" className={attrListBadgeClass}>
                          {attrTypeLabel(t, d.type)}
                        </Badge>
                        <Badge variant="outline" className={attrListBadgeClass}>
                          {d.required ? t('categories.attr_required') : t('categories.attr_optional')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.source_category_name
                          ? t('categories.attr_inherited_from', { name: d.source_category_name })
                          : t('categories.attr_inherited_hint')}
                        {' · '}
                        {t('categories.attr_display_priority')}: {priLabel}
                        {opts ? ` · ${t('categories.attr_options')}: ${opts}` : null}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {ownDefs.length === 0 && inheritedDefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('categories.attr_empty')}</p>
        ) : null}
      </div>

      {canUpdate ? <CategoryAttributeAddForm categoryId={categoryId} defs={defs} onDone={invalidate} /> : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('categories.attr_edit')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-sm">{t('categories.attr_field_key')}</Label>
              <Input value={editing?.key ?? ''} readOnly className="h-9 bg-muted/50 font-mono text-sm" dir="ltr" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-sm">{t('categories.attr_field_label')}</Label>
                <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">{t('categories.attr_field_type')}</Label>
                <Select value={editType} onValueChange={setEditType}>
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t('categories.attr_types.text')}</SelectItem>
                    <SelectItem value="int">{t('categories.attr_types.int')}</SelectItem>
                    <SelectItem value="float">{t('categories.attr_types.float')}</SelectItem>
                    <SelectItem value="bool">{t('categories.attr_types.bool')}</SelectItem>
                    <SelectItem value="date">{t('categories.attr_types.date')}</SelectItem>
                    <SelectItem value="select">{t('categories.attr_types.select')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">{t('categories.attr_display_priority')}</Label>
                <Select value={editPriority} onValueChange={(v) => setEditPriority(v as DisplayPriority)}>
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">{t('categories.attr_priority_high')}</SelectItem>
                    <SelectItem value="mid">{t('categories.attr_priority_mid')}</SelectItem>
                    <SelectItem value="low">{t('categories.attr_priority_low')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <Label className="text-sm">{t('categories.attr_field_required')}</Label>
              <Switch checked={editRequired} onCheckedChange={setEditRequired} />
            </div>
            {editType === 'select' ? (
              <div className="space-y-1">
                <Label className="text-sm">{t('categories.attr_field_select_options')}</Label>
                <Input
                  value={editOptionsCsv}
                  onChange={(e) => setEditOptionsCsv(e.target.value)}
                  className="h-9 text-sm"
                  placeholder="S,M,L,XL"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="button" onClick={() => void saveEditM.mutate()} disabled={saveEditM.isPending}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('categories.attr_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('categories.attr_delete_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteCategoryAttribute(categoryId, deleteTarget.id);
                  setDeleteTarget(null);
                  await invalidate();
                  toast.success(t('categories.attr_deleted'));
                } catch (e) {
                  notifyApiError(e, t('errors.generic'));
                }
              }}
            >
              {t('actions.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryAttributeAddForm({
  categoryId,
  defs,
  onDone,
}: {
  categoryId: number;
  defs: CategoryAttrDef[];
  onDone: () => void;
}) {
  const { t } = useTranslation('catalog');
  const [presetKey, setPresetKey] = useState<CategoryAttrPresetKey | ''>('');
  const [type, setType] = useState('text');
  const [required, setRequired] = useState(false);
  const [priority, setPriority] = useState<DisplayPriority>('high');
  const [selectOptionsCsv, setSelectOptionsCsv] = useState('S,M,L,XL');

  const usedKeys = useMemo(() => new Set(defs.map((d) => d.key.toUpperCase())), [defs]);

  useEffect(() => {
    setPresetKey('');
    setType('text');
    setRequired(false);
    setPriority('high');
    setSelectOptionsCsv('S,M,L,XL');
  }, [categoryId]);

  useEffect(() => {
    if (!presetKey) {
      setType('text');
      return;
    }
    const spec = CATEGORY_ATTR_PRESETS.find((p) => p.key === presetKey);
    if (!spec) return;
    if (spec.type === 'select') {
      setType('select');
      setSelectOptionsCsv(spec.key === 'SIZE' ? 'S,M,L,XL' : '');
    } else if (spec.type === 'float') {
      setType('float');
    } else if (spec.type === 'date') {
      setType('date');
    } else {
      setType('text');
    }
  }, [presetKey]);

  const availablePresets = useMemo(
    () => CATEGORY_ATTR_PRESETS.filter((p) => !usedKeys.has(p.key)),
    [usedKeys],
  );

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium text-muted-foreground">{t('categories.attr_add')}</p>
      <div className="w-full max-w-xl space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-sm">{t('categories.attr_select_property')}</Label>
            <Select
              value={presetKey || '__none__'}
              onValueChange={(v) => setPresetKey(v === '__none__' ? '' : (v as CategoryAttrPresetKey))}
            >
              <SelectTrigger className="h-9 w-full text-sm">
                <SelectValue placeholder={t('categories.attr_select_property_ph')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('categories.attr_select_property_ph')}</SelectItem>
                {availablePresets.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    <span className="font-medium">{t(`categories.attr_presets.${p.key}`)}</span>
                    <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
                      {p.key}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-snug text-muted-foreground">{t('categories.attr_preset_key_fixed_hint')}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">{t('categories.attr_field_type')}</Label>
            <Select value={type} onValueChange={setType} disabled={!presetKey}>
              <SelectTrigger className="h-9 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">{t('categories.attr_types.text')}</SelectItem>
                <SelectItem value="int">{t('categories.attr_types.int')}</SelectItem>
                <SelectItem value="float">{t('categories.attr_types.float')}</SelectItem>
                <SelectItem value="bool">{t('categories.attr_types.bool')}</SelectItem>
                <SelectItem value="date">{t('categories.attr_types.date')}</SelectItem>
                <SelectItem value="select">{t('categories.attr_types.select')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">{t('categories.attr_display_priority')}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as DisplayPriority)} disabled={!presetKey}>
              <SelectTrigger className="h-9 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">{t('categories.attr_priority_high')}</SelectItem>
                <SelectItem value="mid">{t('categories.attr_priority_mid')}</SelectItem>
                <SelectItem value="low">{t('categories.attr_priority_low')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:col-span-2">
            <Label className="text-sm">{t('categories.attr_field_required')}</Label>
            <Switch checked={required} onCheckedChange={setRequired} disabled={!presetKey} />
          </div>
          {type === 'select' ? (
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-sm" htmlFor="add-attr-opts">
                {t('categories.attr_field_select_options')}
              </Label>
              <Input
                id="add-attr-opts"
                value={selectOptionsCsv}
                onChange={(e) => setSelectOptionsCsv(e.target.value)}
                className="h-9 text-sm"
                placeholder="S,M,L,XL"
                disabled={!presetKey}
              />
            </div>
          ) : null}
        </div>
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            size="default"
            className="min-w-[7rem]"
            disabled={!presetKey}
            onClick={async () => {
              if (!presetKey) return;
              const labelFromPreset = t(`categories.attr_presets.${presetKey}`).trim();
              if (!labelFromPreset) return;
              try {
                const values =
                  type === 'select'
                    ? selectOptionsCsv
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : [];
                if (type === 'select' && values.length === 0) {
                  toast.error(t('categories.attr_select_needs_options'));
                  return;
                }
                await createCategoryAttribute(categoryId, {
                  key: presetKey,
                  label: labelFromPreset,
                  type: type.trim() || 'text',
                  required,
                  sort_order: DISPLAY_PRIORITY_SORT[priority],
                  ...(type === 'select' && values.length ? { options: { values } } : {}),
                });
                setPresetKey('');
                setType('text');
                setRequired(false);
                setPriority('high');
                setSelectOptionsCsv('S,M,L,XL');
                onDone();
                toast.success(t('categories.attr_added'));
              } catch (error) {
                notifyApiError(error, t('errors.generic'));
              }
            }}
          >
            {t('actions.add')}
          </Button>
        </div>
      </div>
    </div>
  );
}

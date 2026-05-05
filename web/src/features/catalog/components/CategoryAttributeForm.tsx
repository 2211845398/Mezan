import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  type AttrDef,
  createCategoryAttribute,
  deleteCategoryAttribute,
  updateCategoryAttribute,
} from '../api';
import { catalogKeys } from '../queries';

function selectOptionsPreview(d: AttrDef): string {
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
  defs: AttrDef[];
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
  const [editing, setEditing] = useState<AttrDef | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState('text');
  const [editRequired, setEditRequired] = useState(false);
  const [editSort, setEditSort] = useState('0');
  const [editOptionsCsv, setEditOptionsCsv] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<AttrDef | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: catalogKeys.root });

  const openEdit = (d: AttrDef) => {
    setEditing(d);
    setEditLabel(d.label);
    setEditType(normalizeAttrType(d.type));
    setEditRequired(d.required);
    setEditSort(String(d.sort_order ?? 0));
    setEditOptionsCsv(selectOptionsPreview(d) || '');
    setEditOpen(true);
  };

  const saveEditM = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('no edit');
      const sortN = Number.parseInt(editSort, 10);
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
        sort_order: Number.isFinite(sortN) ? sortN : 0,
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
      <div className="space-y-3">
        {sorted.map((d) => {
          const opts = selectOptionsPreview(d);
          return (
            <div
              key={d.id}
              className={cn('flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between')}
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
                  {t('categories.attr_sort')}: {d.sort_order}
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
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('categories.attr_empty')}</p>
        ) : null}
      </div>

      {canUpdate ? <CategoryAttributeAddForm categoryId={categoryId} onDone={invalidate} /> : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('categories.attr_edit')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>{t('categories.attr_field_key')}</Label>
              <Input value={editing?.key ?? ''} readOnly className="bg-muted/50 font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <Label>{t('categories.attr_field_label')}</Label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('categories.attr_field_type')}</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger>
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
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <Label>{t('categories.attr_field_required')}</Label>
              <Switch checked={editRequired} onCheckedChange={setEditRequired} />
            </div>
            <div className="space-y-1">
              <Label>{t('categories.attr_field_sort')}</Label>
              <Input value={editSort} onChange={(e) => setEditSort(e.target.value)} type="number" />
            </div>
            {editType === 'select' ? (
              <div className="space-y-1">
                <Label>{t('categories.attr_field_select_options')}</Label>
                <Input value={editOptionsCsv} onChange={(e) => setEditOptionsCsv(e.target.value)} />
              </div>
            ) : null}
          </div>
          <DialogFooter>
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

function CategoryAttributeAddForm({ categoryId, onDone }: { categoryId: number; onDone: () => void }) {
  const { t } = useTranslation('catalog');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [selectOptionsCsv, setSelectOptionsCsv] = useState('S,M,L,XL');

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium">{t('categories.attr_add')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="add-attr-key">{t('categories.attr_field_key')}</Label>
          <Input id="add-attr-key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="add-attr-label">{t('categories.attr_field_label')}</Label>
          <Input id="add-attr-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>{t('categories.attr_field_type')}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
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
        {type === 'select' ? (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="add-attr-opts">{t('categories.attr_field_select_options')}</Label>
            <Input
              id="add-attr-opts"
              value={selectOptionsCsv}
              onChange={(e) => setSelectOptionsCsv(e.target.value)}
              placeholder="S,M,L,XL"
            />
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        onClick={async () => {
          if (!key.trim() || !label.trim()) return;
          try {
            const values =
              type === 'select'
                ? selectOptionsCsv
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [];
            await createCategoryAttribute(categoryId, {
              key: key.trim(),
              label: label.trim(),
              type: type.trim() || 'text',
              required: false,
              sort_order: 0,
              ...(type === 'select' && values.length ? { options: { values } } : {}),
            });
            setKey('');
            setLabel('');
            setType('text');
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
  );
}

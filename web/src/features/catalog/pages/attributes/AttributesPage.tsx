import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { handleDialogFormEnterSubmit } from '@/lib/formSubmitOnEnter';
import { cn } from '@/lib/utils';

import { MergeAttributeValuesDialog } from '../../components/MergeAttributeValuesDialog';
import {
  createCatalogAttribute,
  createCatalogAttributeValue,
  deleteCatalogAttribute,
  deleteCatalogAttributeValue,
  listCatalogAttributeValues,
  listCatalogAttributes,
  mergeCatalogAttributeValues,
  updateCatalogAttribute,
  updateCatalogAttributeValue,
  type CatalogAttributeValueRead,
} from '../../api';
import { catalogKeys } from '../../queries';

export default function AttributesPage() {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const canCreate = usePermission('catalog', 'create');
  const canUpdate = usePermission('catalog', 'update');
  const canDelete = usePermission('catalog', 'delete');

  const { data: attributes = [], isLoading } = useQuery({
    queryKey: [...catalogKeys.root, 'catalogAttributes'],
    queryFn: listCatalogAttributes,
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [createAttrOpen, setCreateAttrOpen] = useState(false);
  const [newAttrName, setNewAttrName] = useState('');

  const [valueDialogAttrId, setValueDialogAttrId] = useState<number | null>(null);
  const [newValueLabel, setNewValueLabel] = useState('');

  const [editAttrId, setEditAttrId] = useState<number | null>(null);
  const [editAttrName, setEditAttrName] = useState('');

  const [editValue, setEditValue] = useState<{
    attributeId: number;
    valueId: number;
    label: string;
  } | null>(null);

  const [mergeDialogAttrId, setMergeDialogAttrId] = useState<number | null>(null);

  const { data: mergeDialogValues = [], isLoading: mergeValuesLoading } = useQuery({
    queryKey: [...catalogKeys.root, 'attrValues', mergeDialogAttrId],
    queryFn: () => listCatalogAttributeValues(mergeDialogAttrId!),
    enabled: mergeDialogAttrId != null,
  });

  const createAttrM = useMutation({
    mutationFn: () =>
      createCatalogAttribute({
        name: newAttrName.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'catalogAttributes'] });
      setCreateAttrOpen(false);
      setNewAttrName('');
      toast.success(t('globalAttributes.created'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const createValueM = useMutation({
    mutationFn: ({ attributeId, label }: { attributeId: number; label: string }) =>
      createCatalogAttributeValue(attributeId, {
        label,
        code: null,
      }),
    onSuccess: (_, { attributeId }) => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'attrValues', attributeId] });
      setValueDialogAttrId(null);
      setNewValueLabel('');
      toast.success(t('globalAttributes.value_added'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const updateAttrM = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updateCatalogAttribute(id, { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'catalogAttributes'] });
      setEditAttrId(null);
      toast.success(t('globalAttributes.updated'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const deleteAttrM = useMutation({
    mutationFn: (id: number) => deleteCatalogAttribute(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'catalogAttributes'] });
      toast.success(t('globalAttributes.deleted'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const updateValueM = useMutation({
    mutationFn: ({
      attributeId,
      valueId,
      label,
    }: {
      attributeId: number;
      valueId: number;
      label: string;
    }) => updateCatalogAttributeValue(attributeId, valueId, { label }),
    onSuccess: (_, { attributeId }) => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'attrValues', attributeId] });
      setEditValue(null);
      toast.success(t('globalAttributes.value_updated'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const deleteValueM = useMutation({
    mutationFn: ({ attributeId, valueId }: { attributeId: number; valueId: number }) =>
      deleteCatalogAttributeValue(attributeId, valueId),
    onSuccess: (_, { attributeId }) => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'attrValues', attributeId] });
      toast.success(t('globalAttributes.value_deleted'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const renderAttributeRow = (attr: (typeof attributes)[number]) => (
    <AttributeRow
      key={attr.id}
      attributeId={attr.id}
      name={attr.name}
      valueCount={attr.value_count ?? 0}
      expanded={expandedId === attr.id}
      onToggle={() => setExpandedId((id) => (id === attr.id ? null : attr.id))}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
      onAddValue={() => {
        setNewValueLabel('');
        setValueDialogAttrId(attr.id);
      }}
      onOpenMerge={() => setMergeDialogAttrId(attr.id)}
      onEditAttribute={() => {
        setEditAttrId(attr.id);
        setEditAttrName(attr.name);
      }}
      onDeleteAttribute={() => deleteAttrM.mutate(attr.id)}
      onEditValue={(v) =>
        setEditValue({
          attributeId: attr.id,
          valueId: v.id,
          label: v.label,
        })
      }
      onDeleteValue={(v) => deleteValueM.mutate({ attributeId: attr.id, valueId: v.id })}
    />
  );

  const mergeValuesM = useMutation({
    mutationFn: ({
      attributeId,
      target_value_id,
      source_value_ids,
    }: {
      attributeId: number;
      target_value_id: number;
      source_value_ids: number[];
    }) => mergeCatalogAttributeValues(attributeId, { target_value_id, source_value_ids }),
    onSuccess: (_, { attributeId }) => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'attrValues', attributeId] });
      void qc.invalidateQueries({ queryKey: catalogKeys.root });
      setMergeDialogAttrId(null);
      toast.success(t('globalAttributes.merged'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={t('globalAttributes.title')}
        actions={
          canCreate ? (
            <Button type="button" size="sm" onClick={() => setCreateAttrOpen(true)}>
              <Plus className="me-1 h-4 w-4" />
              {t('globalAttributes.add_attribute')}
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <>
          <div className="flex flex-col gap-4 lg:hidden">
            {[0, 1].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted/40" />
            ))}
          </div>
          <div className="hidden gap-4 lg:flex">
            <div className="flex flex-1 flex-col gap-4">
              <div className="h-14 animate-pulse rounded-lg border bg-muted/40" />
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <div className="h-14 animate-pulse rounded-lg border bg-muted/40" />
            </div>
          </div>
        </>
      ) : attributes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('globalAttributes.empty_short')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 lg:hidden">{attributes.map(renderAttributeRow)}</div>
          <div className="hidden gap-4 lg:flex">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {attributes.filter((_, i) => i % 2 === 0).map(renderAttributeRow)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {attributes.filter((_, i) => i % 2 === 1).map(renderAttributeRow)}
            </div>
          </div>
        </>
      )}

      <Dialog open={createAttrOpen} onOpenChange={setCreateAttrOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (createAttrM.isPending || !newAttrName.trim()) return;
              createAttrM.mutate();
            }}
            onKeyDown={handleDialogFormEnterSubmit}
          >
            <DialogHeader>
              <DialogTitle>{t('globalAttributes.add_attribute')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              <Label>{t('categories.attr_catalog_name')}</Label>
              <Input value={newAttrName} onChange={(e) => setNewAttrName(e.target.value)} className="h-9" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateAttrOpen(false)}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={createAttrM.isPending || !newAttrName.trim()}>
                {t('actions.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={valueDialogAttrId != null} onOpenChange={(o) => !o && setValueDialogAttrId(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (createValueM.isPending || !newValueLabel.trim() || valueDialogAttrId == null) return;
              createValueM.mutate({
                attributeId: valueDialogAttrId,
                label: newValueLabel.trim(),
              });
            }}
            onKeyDown={handleDialogFormEnterSubmit}
          >
            <DialogHeader>
              <DialogTitle>{t('globalAttributes.add_value')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              <Label>{t('globalAttributes.value_label')}</Label>
              <Input
                value={newValueLabel}
                onChange={(e) => setNewValueLabel(e.target.value)}
                className="h-9"
                placeholder={t('products.variants.new_value_placeholder')}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setValueDialogAttrId(null)}>
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createValueM.isPending || !newValueLabel.trim() || valueDialogAttrId == null}
              >
                {t('actions.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editAttrId != null} onOpenChange={(o) => !o && setEditAttrId(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (updateAttrM.isPending || !editAttrName.trim() || editAttrId == null) return;
              updateAttrM.mutate({ id: editAttrId, name: editAttrName.trim() });
            }}
            onKeyDown={handleDialogFormEnterSubmit}
          >
            <DialogHeader>
              <DialogTitle>{t('globalAttributes.edit_attribute')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              <Label>{t('categories.attr_catalog_name')}</Label>
              <Input
                value={editAttrName}
                onChange={(e) => setEditAttrName(e.target.value)}
                className="h-9"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditAttrId(null)}>
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={updateAttrM.isPending || !editAttrName.trim() || editAttrId == null}
              >
                {t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editValue != null} onOpenChange={(o) => !o && setEditValue(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (updateValueM.isPending || !editValue?.label.trim()) return;
              updateValueM.mutate({
                attributeId: editValue.attributeId,
                valueId: editValue.valueId,
                label: editValue.label.trim(),
              });
            }}
            onKeyDown={handleDialogFormEnterSubmit}
          >
            <DialogHeader>
              <DialogTitle>{t('globalAttributes.edit_value')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              <Label>{t('globalAttributes.value_label')}</Label>
              <Input
                value={editValue?.label ?? ''}
                onChange={(e) =>
                  setEditValue((cur) => (cur ? { ...cur, label: e.target.value } : cur))
                }
                className="h-9"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditValue(null)}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={updateValueM.isPending || !editValue?.label.trim()}>
                {t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MergeAttributeValuesDialog
        open={mergeDialogAttrId != null}
        onOpenChange={(o) => !o && setMergeDialogAttrId(null)}
        values={mergeDialogValues}
        isLoading={mergeValuesLoading}
        pending={mergeValuesM.isPending}
        onConfirm={(targetId, sourceIds) => {
          if (mergeDialogAttrId == null) return;
          mergeValuesM.mutate({
            attributeId: mergeDialogAttrId,
            target_value_id: targetId,
            source_value_ids: sourceIds,
          });
        }}
      />
    </div>
  );
}

function AttributeValueChip({
  value,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  value: CatalogAttributeValueRead;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border bg-muted/30 px-2 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{value.label}</p>
        {value.usage_count != null ? (
          <p className="text-[10px] text-muted-foreground num-latin">({value.usage_count})</p>
        ) : null}
      </div>
      {canUpdate || canDelete ? (
        <div className="flex justify-end gap-0.5">
          {canUpdate ? (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {canDelete ? (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AttributeRow({
  attributeId,
  name,
  valueCount,
  expanded,
  onToggle,
  canCreate,
  canUpdate,
  canDelete,
  onAddValue,
  onOpenMerge,
  onEditAttribute,
  onDeleteAttribute,
  onEditValue,
  onDeleteValue,
}: {
  attributeId: number;
  name: string;
  valueCount: number;
  expanded: boolean;
  onToggle: () => void;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onAddValue: () => void;
  onOpenMerge: () => void;
  onEditAttribute: () => void;
  onDeleteAttribute: () => void;
  onEditValue: (v: CatalogAttributeValueRead) => void;
  onDeleteValue: (v: CatalogAttributeValueRead) => void;
}) {
  const { t } = useTranslation('catalog');
  const { data: values = [], isLoading } = useQuery({
    queryKey: [...catalogKeys.root, 'attrValues', attributeId],
    queryFn: () => listCatalogAttributeValues(attributeId),
    enabled: expanded,
  });

  const showMerge = canUpdate && values.length > 1;

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-colors',
        expanded && 'ring-1 ring-border',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
          onClick={onToggle}
        >
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="font-medium truncate">{name}</span>
          <span className="text-xs text-muted-foreground num-latin shrink-0">({valueCount})</span>
        </button>
        {canUpdate ? (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onEditAttribute}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
        {canDelete ? (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onDeleteAttribute}>
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <div className="flex flex-col border-t px-3 py-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">{t('loading')}</p>
          ) : values.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('globalAttributes.no_values')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {values.map((v) => (
                <AttributeValueChip
                  key={v.id}
                  value={v}
                  canUpdate={canUpdate}
                  canDelete={canDelete}
                  onEdit={() => onEditValue(v)}
                  onDelete={() => onDeleteValue(v)}
                />
              ))}
            </div>
          )}
          {canCreate || showMerge ? (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
              {showMerge ? (
                <Button type="button" variant="outline" size="sm" onClick={onOpenMerge}>
                  {t('globalAttributes.merge_button')}
                </Button>
              ) : null}
              {canCreate ? (
                <Button type="button" variant="outline" size="sm" onClick={onAddValue}>
                  <Plus className="me-1 h-3 w-3" />
                  {t('globalAttributes.add_value')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

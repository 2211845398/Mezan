import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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

import {
  type CategoryTreeNode,
  createCategory,
  createCategoryAttribute,
  deleteCategoryAttribute,
} from '../../api';
import { catalogKeys, useCategoryAttributesQuery, useCategoryTreeQuery } from '../../queries';

function Node({
  node,
  depth,
  onAddChild,
  onEditAttrs,
}: {
  node: CategoryTreeNode;
  depth: number;
  onAddChild: (parentId: number) => void;
  onEditAttrs: (id: number) => void;
}) {
  const { t } = useTranslation('catalog');
  const [open, setOpen] = useState(depth < 2);
  const canUpdate = usePermission('catalog', 'update');
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="ms-2 border-s border-border ps-2">
      <div
        className="flex flex-wrap items-center gap-2 py-1"
        style={{ paddingInlineStart: depth * 8 }}
      >
        <CollapsibleTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="size-7">
            <ChevronRight
              className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
              aria-hidden
            />
          </Button>
        </CollapsibleTrigger>
        <span className="font-medium">{node.name}</span>
        {canUpdate ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => onAddChild(node.id)}>
              <Plus className="me-0.5 size-3" />
              {t('categories.child')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onEditAttrs(node.id)}>
              {t('categories.attributes')}
            </Button>
          </>
        ) : null}
      </div>
      <CollapsibleContent>
        {node.children?.map((c) => (
          <Node
            key={c.id}
            node={c}
            depth={depth + 1}
            onAddChild={onAddChild}
            onEditAttrs={onEditAttrs}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function CategoriesTree() {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const canCreate = usePermission('catalog', 'create');
  const canUpdate = usePermission('catalog', 'update');
  const { data: tree = [], isLoading, refetch } = useCategoryTreeQuery();
  const [showNew, setShowNew] = useState(false);
  const [parentForNew, setParentForNew] = useState<number | null>(null);
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [attrCategoryId, setAttrCategoryId] = useState<number | null>(null);
  const { data: attrDefs = [] } = useCategoryAttributesQuery(attrCategoryId);

  const createM = useMutation({
    mutationFn: () => {
      const slug = newSlug.trim() || newName.toLowerCase().replace(/\s+/g, '-');
      return createCategory({
        name: newName.trim(),
        slug,
        parent_id: parentForNew,
        sort_order: 0,
        is_active: true,
      });
    },
    onSuccess: async () => {
      setShowNew(false);
      setParentForNew(null);
      setNewName('');
      setNewSlug('');
      await qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('categories.created'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  function startNew(parent: number | null) {
    setParentForNew(parent);
    setNewName('');
    setNewSlug('');
    setShowNew(true);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('categories.title')}</h1>
        {canCreate ? (
          <Button type="button" onClick={() => startNew(null)}>
            {t('categories.add_root')}
          </Button>
        ) : null}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
      <div>
        {tree.map((n) => (
          <Node
            key={n.id}
            node={n}
            depth={0}
            onAddChild={(pid) => startNew(pid)}
            onEditAttrs={setAttrCategoryId}
          />
        ))}
      </div>
      <Button type="button" variant="link" onClick={() => void refetch()}>
        {t('actions.refresh')}
      </Button>

      <Dialog
        open={showNew}
        onOpenChange={(o) => {
          if (!o) {
            setShowNew(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('categories.new')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('categories.field.name')}</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Label>{t('categories.field.slug')}</Label>
            <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowNew(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (newName.trim()) {
                  void createM.mutate();
                }
              }}
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={attrCategoryId != null}
        onOpenChange={(o) => {
          if (!o) {
            setAttrCategoryId(null);
          }
        }}
      >
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('categories.attr_editor')}</DialogTitle>
          </DialogHeader>
          {attrDefs
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 border-b py-2 text-sm"
              >
                <div>
                  <code className="text-xs">{d.key}</code> — {d.label} ({d.type})
                </div>
                {canUpdate && attrCategoryId != null ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      try {
                        await deleteCategoryAttribute(attrCategoryId, d.id);
                        void qc.invalidateQueries({ queryKey: catalogKeys.root });
                        toast.success(t('categories.attr_deleted'));
                      } catch (error) {
                        notifyApiError(error, t('errors.generic'));
                      }
                    }}
                  >
                    {t('actions.delete')}
                  </Button>
                ) : null}
              </div>
            ))}
          {canUpdate && attrCategoryId != null ? (
            <AddAttrForm
              categoryId={attrCategoryId}
              onDone={() => {
                void qc.invalidateQueries({ queryKey: catalogKeys.root });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddAttrForm({ categoryId, onDone }: { categoryId: number; onDone: () => void }) {
  const { t } = useTranslation('catalog');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-medium">{t('categories.attr_add')}</p>
      <Input placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
      <Input placeholder="label" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Input
        placeholder="type (text|int|float|bool)"
        value={type}
        onChange={(e) => setType(e.target.value)}
      />
      <Button
        type="button"
        onClick={async () => {
          if (!key.trim() || !label.trim()) {
            return;
          }
          try {
            await createCategoryAttribute(categoryId, {
              key: key.trim(),
              label: label.trim(),
              type: type.trim() || 'text',
              required: false,
              sort_order: 0,
            });
            setKey('');
            setLabel('');
            onDone();
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

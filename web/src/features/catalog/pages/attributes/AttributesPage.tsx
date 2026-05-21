import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
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

import {
  createCatalogAttribute,
  createCatalogAttributeValue,
  listCatalogAttributeValues,
  listCatalogAttributes,
} from '../../api';
import { catalogKeys } from '../../queries';

export default function AttributesPage() {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const canCreate = usePermission('catalog', 'create');

  const { data: attributes = [], isLoading } = useQuery({
    queryKey: [...catalogKeys.root, 'catalogAttributes'],
    queryFn: listCatalogAttributes,
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [createAttrOpen, setCreateAttrOpen] = useState(false);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrCode, setNewAttrCode] = useState('');

  const [valueDialogAttrId, setValueDialogAttrId] = useState<number | null>(null);
  const [newValueLabel, setNewValueLabel] = useState('');

  const createAttrM = useMutation({
    mutationFn: () =>
      createCatalogAttribute({
        name: newAttrName.trim(),
        code: newAttrCode.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'catalogAttributes'] });
      setCreateAttrOpen(false);
      setNewAttrName('');
      setNewAttrCode('');
      toast.success(t('globalAttributes.created'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const createValueM = useMutation({
    mutationFn: ({ attributeId, label }: { attributeId: number; label: string }) =>
      createCatalogAttributeValue(attributeId, { label }),
    onSuccess: (_, { attributeId }) => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'attrValues', attributeId] });
      setValueDialogAttrId(null);
      setNewValueLabel('');
      toast.success(t('globalAttributes.value_added'));
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

      <p className="text-sm text-muted-foreground max-w-2xl">{t('globalAttributes.lead')}</p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('globalAttributes.empty')}</p>
      ) : (
        <div className="space-y-2 max-w-3xl">
          {attributes.map((attr) => (
            <AttributeRow
              key={attr.id}
              attributeId={attr.id}
              name={attr.name}
              code={attr.code}
              expanded={expandedId === attr.id}
              onToggle={() => setExpandedId((id) => (id === attr.id ? null : attr.id))}
              canCreate={canCreate}
              onAddValue={() => {
                setNewValueLabel('');
                setValueDialogAttrId(attr.id);
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={createAttrOpen} onOpenChange={setCreateAttrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('globalAttributes.add_attribute')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>{t('categories.attr_catalog_name')}</Label>
              <Input value={newAttrName} onChange={(e) => setNewAttrName(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label>{t('categories.attr_catalog_code')}</Label>
              <Input
                value={newAttrCode}
                onChange={(e) => setNewAttrCode(e.target.value)}
                className="h-9 font-mono"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateAttrOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              disabled={createAttrM.isPending || !newAttrName.trim()}
              onClick={() => createAttrM.mutate()}
            >
              {t('actions.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={valueDialogAttrId != null} onOpenChange={(o) => !o && setValueDialogAttrId(null)}>
        <DialogContent>
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
              type="button"
              disabled={createValueM.isPending || !newValueLabel.trim() || valueDialogAttrId == null}
              onClick={() => {
                if (valueDialogAttrId == null) return;
                createValueM.mutate({ attributeId: valueDialogAttrId, label: newValueLabel.trim() });
              }}
            >
              {t('actions.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttributeRow({
  attributeId,
  name,
  code,
  expanded,
  onToggle,
  canCreate,
  onAddValue,
}: {
  attributeId: number;
  name: string;
  code: string;
  expanded: boolean;
  onToggle: () => void;
  canCreate: boolean;
  onAddValue: () => void;
}) {
  const { t } = useTranslation('catalog');
  const { data: values = [], isLoading } = useQuery({
    queryKey: [...catalogKeys.root, 'attrValues', attributeId],
    queryFn: () => listCatalogAttributeValues(attributeId),
    enabled: expanded,
  });

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-start hover:bg-muted/40"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-medium">{name}</span>
        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
          {code}
        </span>
      </button>
      {expanded ? (
        <div className="border-t px-4 py-3 space-y-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">{t('loading')}</p>
          ) : values.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('globalAttributes.no_values')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {values.map((v) => (
                <span
                  key={v.id}
                  className="rounded-full border bg-muted/30 px-2.5 py-0.5 text-xs"
                >
                  {v.label}
                  <span className="ms-1 font-mono text-muted-foreground" dir="ltr">
                    {v.code}
                  </span>
                </span>
              ))}
            </div>
          )}
          {canCreate ? (
            <Button type="button" variant="outline" size="sm" onClick={onAddValue}>
              <Plus className="me-1 h-3 w-3" />
              {t('globalAttributes.add_value')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

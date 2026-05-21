import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { createCatalogAttribute, listCatalogAttributes } from '../api';
import { catalogKeys } from '../queries';

export type CatalogAttributeLinkState = {
  useForVariants: boolean;
  attributeId: number | null;
};

type CatalogAttributeLinkFieldsProps = {
  value: CatalogAttributeLinkState;
  onChange: (next: CatalogAttributeLinkState) => void;
  disabled?: boolean;
  /** When true, forces type select on parent via callback */
  onUseForVariantsChange?: (enabled: boolean) => void;
};

export function CatalogAttributeLinkFields({
  value,
  onChange,
  disabled,
  onUseForVariantsChange,
}: CatalogAttributeLinkFieldsProps) {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');

  const { data: catalogAttrs = [], isLoading } = useQuery({
    queryKey: [...catalogKeys.root, 'catalogAttributes'],
    queryFn: listCatalogAttributes,
  });

  const createM = useMutation({
    mutationFn: () =>
      createCatalogAttribute({
        name: newName.trim(),
        code: newCode.trim() || null,
      }),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: [...catalogKeys.root, 'catalogAttributes'] });
      onChange({ ...value, attributeId: row.id, useForVariants: true });
      onUseForVariantsChange?.(true);
      setCreateOpen(false);
      setNewName('');
      setNewCode('');
      toast.success(t('categories.attr_catalog_created'));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const handleVariantToggle = (checked: boolean) => {
    const next = { ...value, useForVariants: checked };
    if (checked) {
      onChange(next);
      onUseForVariantsChange?.(true);
    } else {
      onChange({ ...next, attributeId: null });
      onUseForVariantsChange?.(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="text-sm">{t('categories.attr_use_for_variants')}</Label>
          <p className="text-xs text-muted-foreground">{t('categories.attr_use_for_variants_hint')}</p>
        </div>
        <Switch
          checked={value.useForVariants}
          disabled={disabled}
          onCheckedChange={handleVariantToggle}
        />
      </div>

      {value.useForVariants ? (
        <div className="space-y-2">
          <Label className="text-sm">{t('categories.attr_catalog_link')}</Label>
          <div className="flex flex-wrap gap-2">
            <Select
              value={value.attributeId != null ? String(value.attributeId) : '__none__'}
              disabled={disabled || isLoading}
              onValueChange={(v) => {
                onChange({
                  ...value,
                  attributeId: v === '__none__' ? null : Number(v),
                });
              }}
            >
              <SelectTrigger className="h-9 min-w-[12rem] flex-1 text-sm">
                <SelectValue placeholder={t('categories.attr_catalog_link_ph')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('categories.attr_catalog_link_ph')}</SelectItem>
                {catalogAttrs.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                    <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
                      {a.code}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={disabled}
              onClick={() => {
                setNewName('');
                setNewCode('');
                setCreateOpen(true);
              }}
            >
              <Plus className="me-1 h-4 w-4" />
              {t('categories.attr_catalog_create')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('categories.attr_catalog_values_hint')}</p>
        </div>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('categories.attr_catalog_create_title')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-sm">{t('categories.attr_catalog_name')}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 text-sm"
                placeholder={t('categories.attr_catalog_name_ph')}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">{t('categories.attr_catalog_code')}</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="h-9 font-mono text-sm"
                dir="ltr"
                placeholder="color"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              disabled={createM.isPending || !newName.trim()}
              onClick={() => createM.mutate()}
            >
              {t('actions.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function catalogAttributeName(
  catalogAttrs: { id: number; name: string }[],
  attributeId: number | null | undefined,
): string | null {
  if (attributeId == null) {
    return null;
  }
  return catalogAttrs.find((a) => a.id === attributeId)?.name ?? `#${attributeId}`;
}

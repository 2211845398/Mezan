import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import type { CatalogAttributeValueRead } from '../api';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: CatalogAttributeValueRead[];
  isLoading?: boolean | undefined;
  pending?: boolean | undefined;
  onConfirm: (targetId: number, sourceIds: number[]) => void;
};

export function MergeAttributeValuesDialog({
  open,
  onOpenChange,
  values,
  isLoading = false,
  pending = false,
  onConfirm,
}: Props) {
  const { t } = useTranslation('catalog');
  const [targetId, setTargetId] = useState<number | null>(null);
  const [sourceIds, setSourceIds] = useState<number[]>([]);

  useEffect(() => {
    if (!open) {
      setTargetId(null);
      setSourceIds([]);
    }
  }, [open]);

  const toggleSource = (id: number) => {
    setSourceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const canSubmit = targetId != null && sourceIds.length > 0 && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('globalAttributes.merge_title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('globalAttributes.merge_desc')}</p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">{t('loading')}</p>
        ) : (
          <div className="space-y-3 rounded-md border border-dashed bg-muted/20 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('globalAttributes.merge_target_ph')}</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={targetId ?? ''}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null;
                  setTargetId(next);
                  if (next != null) {
                    setSourceIds((cur) => cur.filter((id) => id !== next));
                  }
                }}
                disabled={pending}
              >
                <option value="">{t('globalAttributes.merge_target_ph')}</option>
                {values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('globalAttributes.merge_sources_label')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {values
                  .filter((v) => v.id !== targetId)
                  .map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={pending}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        sourceIds.includes(v.id)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:bg-muted/50'
                      }`}
                      onClick={() => toggleSource(v.id)}
                    >
                      {v.label}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || isLoading}
            onClick={() => {
              if (targetId == null) return;
              onConfirm(targetId, sourceIds);
            }}
          >
            {t('globalAttributes.merge_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

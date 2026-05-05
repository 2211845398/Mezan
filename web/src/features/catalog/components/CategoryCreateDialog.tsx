import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';

import { createCategory } from '../api';
import { CategoryImageUploadField } from './CategoryImageUploadField';
import { catalogKeys } from '../queries';

type CategoryCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent for the new category; `null` means root. */
  parentId: number | null;
};

export function CategoryCreateDialog({ open, onOpenChange, parentId }: CategoryCreateDialogProps) {
  const { t } = useTranslation('catalog');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setImageUrl('');
      setIsActive(true);
    }
  }, [open, parentId]);

  const createM = useMutation({
    mutationFn: () => {
      const s = slug.trim() || name.toLowerCase().replace(/\s+/g, '-');
      return createCategory({
        name: name.trim(),
        slug: s,
        parent_id: parentId,
        sort_order: 0,
        is_active: isActive,
        image_url: imageUrl.trim() === '' ? null : imageUrl.trim(),
      });
    },
    onSuccess: async () => {
      onOpenChange(false);
      await qc.invalidateQueries({ queryKey: catalogKeys.root });
      toast.success(t('categories.created'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('categories.new')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t('categories.field.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('categories.field.slug')}</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <CategoryImageUploadField
            value={imageUrl}
            onChange={setImageUrl}
            inputId={parentId == null ? 'category-create-root' : `category-create-${parentId}`}
          />
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{t('categories.field.active')}</p>
              <p className="text-xs text-muted-foreground">{t('categories.field.active_help')}</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (name.trim()) {
                void createM.mutate();
              }
            }}
            disabled={createM.isPending}
          >
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

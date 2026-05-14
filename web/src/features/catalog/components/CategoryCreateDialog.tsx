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
import { catalogKeys } from '../queries';
import { CategoryImageUploadField } from './CategoryImageUploadField';

type CategoryCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent for the new category; `null` means root. */
  parentId: number | null;
};

export function CategoryCreateDialog({ open, onOpenChange, parentId }: CategoryCreateDialogProps) {
  const { t, i18n } = useTranslation('catalog');
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
      <DialogContent dir={i18n.dir()}>
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
          <div className="flex items-center gap-2">
            {i18n.dir() === 'rtl' ? (
              <>
                <Switch
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  aria-labelledby="category-create-active-label"
                />
                <span className="shrink-0 text-sm font-medium" id="category-create-active-label">
                  {isActive ? t('categories.field.active_state_on') : t('categories.field.active_state_off')}
                </span>
              </>
            ) : (
              <>
                <span className="shrink-0 text-sm font-medium" id="category-create-active-label">
                  {isActive ? t('categories.field.active_state_on') : t('categories.field.active_state_off')}
                </span>
                <Switch
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  aria-labelledby="category-create-active-label"
                />
              </>
            )}
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

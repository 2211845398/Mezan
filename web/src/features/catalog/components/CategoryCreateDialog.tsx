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
import { handleDialogFormEnterSubmit } from '@/lib/formSubmitOnEnter';

import { createCategory } from '../api';
import { generateCategorySlug } from '../lib/categorySlug';
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
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setImageUrl('');
    }
  }, [open, parentId]);

  const createM = useMutation({
    mutationFn: () => {
      const trimmedName = name.trim();
      return createCategory({
        name: trimmedName,
        slug: generateCategorySlug(trimmedName),
        parent_id: parentId,
        sort_order: 0,
        is_active: true,
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !createM.isPending) {
              void createM.mutate();
            }
          }}
          onKeyDown={handleDialogFormEnterSubmit}
        >
          <DialogHeader>
            <DialogTitle>{t('categories.new')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('categories.field.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <CategoryImageUploadField
              value={imageUrl}
              onChange={setImageUrl}
              inputId={parentId == null ? 'category-create-root' : `category-create-${parentId}`}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={createM.isPending || !name.trim()}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

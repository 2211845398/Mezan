import { useMutation } from '@tanstack/react-query';
import { Camera, ImageIcon, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';

import { uploadCategoryImage } from '../api';

export type CategoryImageUploadFieldProps = {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  /** Optional stable id for the hidden file input (e.g. when multiple fields on one page). */
  inputId?: string;
  className?: string;
};

export function CategoryImageUploadField({
  value,
  onChange,
  disabled,
  inputId: inputIdProp,
  className,
}: CategoryImageUploadFieldProps) {
  const { t } = useTranslation('catalog');
  const reactId = useId();
  const inputId = inputIdProp ?? `category-image-${reactId}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );

  const uploadM = useMutation({
    mutationFn: (file: File) => uploadCategoryImage(file),
    onSuccess: (data) => {
      setLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      onChange(data.image_url);
      toast.success(t('categories.image_uploaded'));
    },
    onError: (err) => {
      setLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      notifyApiError(err, t('errors.generic'));
    },
  });

  const displaySrc = localPreview ?? resolveMediaUrl(value.trim() || undefined);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || disabled) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('categories.image_invalid_type'));
      return;
    }
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    uploadM.mutate(file);
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={inputId}>{t('categories.field.image_upload')}</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          className={cn(
            'relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted',
            displaySrc && 'border-primary/30',
          )}
        >
          {displaySrc ? (
            <img src={displaySrc} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-10 text-muted-foreground opacity-50" aria-hidden />
          )}
          {uploadM.isPending ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium">
              {t('loading')}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            id={inputId}
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={disabled || uploadM.isPending}
            onChange={onFileChange}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 border-secondary/60"
              disabled={disabled || uploadM.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="size-4 shrink-0" aria-hidden />
              {uploadM.isPending ? t('loading') : t('categories.image_upload_button')}
            </Button>
            {value.trim() !== '' && !disabled ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                disabled={uploadM.isPending}
                onClick={() => onChange('')}
              >
                <X className="size-4" aria-hidden />
                {t('categories.image_remove')}
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">{t('categories.image_hint')}</p>
        </div>
      </div>
    </div>
  );
}

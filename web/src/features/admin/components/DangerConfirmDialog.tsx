import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  floatingFormCloseButtonClassName,
  floatingFormDangerButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmKeyword: string;
  onConfirm: () => void;
  isLoading?: boolean;
};

export function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmKeyword,
  onConfirm,
  isLoading,
}: Props) {
  const { t } = useTranslation('admin');
  const id = useId();
  const [value, setValue] = useState('');
  const canSubmit = value === confirmKeyword;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setValue('');
      }}
    >
      <DialogContent motionless>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit || isLoading) return;
            onConfirm();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={id}>
              {t('confirm.type_keyword', { keyword: confirmKeyword })}
            </Label>
            <Input
              id={id}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={floatingFormCloseButtonClassName}
              onClick={() => onOpenChange(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className={floatingFormDangerButtonClassName}
              disabled={!canSubmit || isLoading}
            >
              {t('actions.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

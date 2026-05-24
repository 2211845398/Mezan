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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLabel: string;
  pending?: boolean;
  onConfirm: (label: string, code: string) => void;
};

export function AttributeValueCodeDialog({
  open,
  onOpenChange,
  initialLabel,
  pending,
  onConfirm,
}: Props) {
  const { t } = useTranslation('catalog');
  const [label, setLabel] = useState(initialLabel);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setCode('');
    }
  }, [open, initialLabel]);

  const trimmedLabel = label.trim();
  const trimmedCode = code.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('products.axes.create_value_code_title', { name: trimmedLabel })}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{t('products.axes.create_value_code_hint')}</p>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>{t('globalAttributes.value_label')}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label>{t('products.axes.create_value_code_label')}</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-9 font-mono"
              dir="ltr"
              placeholder="YEL"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={pending || !trimmedLabel || !trimmedCode}
            onClick={() => onConfirm(trimmedLabel, trimmedCode)}
          >
            {t('actions.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

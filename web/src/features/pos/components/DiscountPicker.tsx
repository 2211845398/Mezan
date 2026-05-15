import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type DiscountPickerProps = {
  disabled?: boolean;
  onApply: (code: string) => Promise<void> | void;
  /** Extra classes on the trigger button (e.g. touch target height). */
  triggerClassName?: string;
};

export function DiscountPicker({ disabled, onApply, triggerClassName }: DiscountPickerProps) {
  const { t } = useTranslation('pos');
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onApply(code.trim());
      setOpen(false);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" className={triggerClassName} disabled={disabled}>
          {t('register.discount_apply')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('register.discount_apply')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="disc-code">{t('register.discount_code')}</Label>
            <Input
              id="disc-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              placeholder={t('register.discount_code_placeholder')}
            />
            <p className="text-xs text-muted-foreground">{t('register.discount_code_hint')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy || !code.trim()}>
            {t('register.discount_apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

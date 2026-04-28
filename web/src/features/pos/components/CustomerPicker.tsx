import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * W-5.1: attaching a customer mid-cart is not exposed in the POS cart API;
 * this is a read-only walk-in label until a dedicated customer endpoint lands.
 */
export function CustomerPicker() {
  const { t } = useTranslation('pos');
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/10 px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t('customer.walk_in')}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {t('customer.add')}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle>{t('customer.add')}</DialogTitle>
            <DialogDescription>{t('customer.unsupported')}</DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 text-sm text-muted-foreground">{t('customer.walk_in')}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

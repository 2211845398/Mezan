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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { CartDiscountBody } from '../api';

export type DiscountPickerProps = {
  disabled?: boolean;
  /** When set, loyalty tab is available and shows this balance (from customer detail). */
  customerLoyaltyBalance: number | null;
  onApply: (body: CartDiscountBody) => Promise<void> | void;
  /** Extra classes on the trigger button (e.g. touch target height). */
  triggerClassName?: string;
};

export function DiscountPicker({
  disabled,
  customerLoyaltyBalance,
  onApply,
  triggerClassName,
}: DiscountPickerProps) {
  const { t } = useTranslation('pos');
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'code' | 'loyalty'>('code');
  const [code, setCode] = useState('');
  const [loyaltyPoints, setLoyaltyPoints] = useState('');
  const [busy, setBusy] = useState(false);

  const loyaltyAvailable = customerLoyaltyBalance != null && customerLoyaltyBalance > 0;

  async function submitCode() {
    setBusy(true);
    try {
      await onApply({ mode: 'code', code: code.trim() });
      setOpen(false);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function submitLoyalty() {
    const n = Number.parseInt(loyaltyPoints, 10);
    if (!Number.isFinite(n) || n < 1) {
      return;
    }
    setBusy(true);
    try {
      await onApply({ mode: 'loyalty', loyalty_points: n });
      setOpen(false);
      setLoyaltyPoints('');
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
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'code' | 'loyalty')}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="code">{t('register.discount_tab_code')}</TabsTrigger>
            <TabsTrigger value="loyalty" disabled={!loyaltyAvailable}>
              {t('register.discount_tab_loyalty')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="code" className="mt-3 space-y-3">
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
          </TabsContent>
          <TabsContent value="loyalty" className="mt-3 space-y-3">
            {!loyaltyAvailable ? (
              <p className="text-sm text-muted-foreground">{t('register.discount_loyalty_no_customer')}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('register.discount_loyalty_balance', { balance: customerLoyaltyBalance })}
                </p>
                <div className="space-y-1">
                  <Label htmlFor="disc-loyalty-pts">{t('register.discount_loyalty_points')}</Label>
                  <Input
                    id="disc-loyalty-pts"
                    inputMode="numeric"
                    value={loyaltyPoints}
                    onChange={(e) => setLoyaltyPoints(e.target.value.replace(/\D/g, ''))}
                    autoComplete="off"
                    placeholder={t('register.discount_loyalty_points_placeholder')}
                  />
                  <p className="text-xs text-muted-foreground">{t('register.discount_loyalty_hint')}</p>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          {tab === 'code' ? (
            <Button type="button" onClick={() => void submitCode()} disabled={busy || !code.trim()}>
              {t('register.discount_apply')}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void submitLoyalty()}
              disabled={busy || !loyaltyAvailable || !loyaltyPoints.trim()}
            >
              {t('register.discount_apply')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

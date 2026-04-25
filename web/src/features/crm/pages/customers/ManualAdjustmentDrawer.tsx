import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { postLoyaltyAdjustment } from '../../api';
import { crmKeys } from '../../queries';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customerId: number;
};

export default function ManualAdjustmentDrawer({ open, onOpenChange, customerId }: Props) {
  const { t } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [points, setPoints] = useState('1');
  const [entryType, setEntryType] = useState<'credit' | 'debit'>('credit');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setPoints('1');
      setEntryType('credit');
      setNote('');
    }
  }, [open]);

  const pointsNum = useMemo(() => {
    const n = Number.parseInt(points, 10);
    return Number.isFinite(n) ? n : 0;
  }, [points]);

  const canSubmit = pointsNum > 0 && note.trim().length > 0;

  const m = useMutation({
    mutationFn: () =>
      postLoyaltyAdjustment({
        customer_id: customerId,
        points: pointsNum,
        entry_type: entryType,
        reason_code: 'manual_adjustment',
        note: note.trim(),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.root });
      toast.success(t('loyalty.adjust_ok'));
      onOpenChange(false);
    },
    onError: () => toast.error(t('errors.generic')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('loyalty.adjust_title')}</DialogTitle>
          <DialogDescription>{t('loyalty.adjust_hint')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>{t('loyalty.entry_type')}</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as 'credit' | 'debit')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">{t('loyalty.credit')}</SelectItem>
                <SelectItem value="debit">{t('loyalty.debit')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="loy-adj-points">{t('loyalty.points')}</Label>
            <Input
              id="loy-adj-points"
              inputMode="numeric"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="loy-adj-note">{t('loyalty.reason_note')}</Label>
            <Input id="loy-adj-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" disabled={!canSubmit || m.isPending} onClick={() => void m.mutate()}>
            {t('loyalty.submit_adjust')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

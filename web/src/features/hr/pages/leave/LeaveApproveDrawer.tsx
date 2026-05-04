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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { newIdempotencyKey } from '@/lib/idempotency';

import { type LeaveRequestRead,reviewLeaveRequest } from '../../api';
import { hrKeys } from '../../queries';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leave: LeaveRequestRead | null;
};

export default function LeaveApproveDrawer({ open, onOpenChange, leave }: Props) {
  const { t } = useTranslation('hr');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) setNotes('');
  }, [open, leave?.id]);

  const approveM = useMutation({
    mutationFn: async (action: 'approve' | 'reject') => {
      if (!leave) throw new Error('no leave');
      const idem = newIdempotencyKey();
      return reviewLeaveRequest(leave.id, { action, review_notes: notes || null, idempotency_key: idem }, idem);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: hrKeys.root });
      toast.success(t('leave.review_ok'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('leave.review_title')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Label htmlFor="notes">{t('leave.review_notes')}</Label>
          <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter className="flex flex-row flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={approveM.isPending}
            onClick={() => approveM.mutate('reject')}
          >
            {t('leave.reject')}
          </Button>
          <Button type="button" disabled={approveM.isPending} onClick={() => approveM.mutate('approve')}>
            {t('leave.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

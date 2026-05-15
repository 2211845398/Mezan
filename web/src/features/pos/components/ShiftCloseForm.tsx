import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getApiErrorMessage } from '@/api/errorMessages';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { useCloseShift, useCurrentShift } from '../queries';
import { usePosTerminalStore } from '../stores/posTerminalStore';

export type ShiftCloseFormProps = {
  /** Called after a successful close (e.g. close floating dialog). */
  onSuccess?: () => void;
};

export function ShiftCloseForm({ onSuccess }: ShiftCloseFormProps) {
  const { t } = useTranslation('pos');
  const { activeTerminalId: terminalId } = usePosTerminalStore();
  const { data: shift } = useCurrentShift(terminalId);
  const closeMut = useCloseShift();
  const canClose = usePermission('pos_shifts', 'close');

  const [declared, setDeclared] = useState('');

  if (!terminalId) {
    return <p className="text-sm text-destructive">{t('gate.select_terminal')}</p>;
  }
  if (!shift) {
    return <p className="text-sm text-muted-foreground">{t('register.need_shift')}</p>;
  }

  const shiftId = shift.id;

  async function submit() {
    try {
      await closeMut.mutateAsync({ shiftId, declaredCash: declared || '0' });
      notify.success(t('close.done'));
      setDeclared('');
      onSuccess?.();
    } catch (e) {
      notify.error(getApiErrorMessage(e));
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="pos-shift-close-declared">
          {t('close.declared')}
        </label>
        <MoneyInput id="pos-shift-close-declared" value={declared} onChange={setDeclared} />
      </div>
      <Button type="button" onClick={() => void submit()} disabled={!canClose || closeMut.isPending}>
        {t('close.submit')}
      </Button>
    </div>
  );
}

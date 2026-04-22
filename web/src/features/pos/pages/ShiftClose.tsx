import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';

import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { useCloseShift, useCurrentShift } from '../queries';
import { usePosTerminalStore } from '../stores/posTerminalStore';

export default function ShiftClose() {
  const { t } = useTranslation('pos');
  const { activeTerminalId: terminalId } = usePosTerminalStore();
  const { data: shift } = useCurrentShift(terminalId);
  const closeMut = useCloseShift();
  const canClose = usePermission('pos_shifts', 'close');

  const [declared, setDeclared] = useState('');

  if (!terminalId) {
    return <Navigate to="/pos" replace />;
  }
  if (!shift) {
    return <Navigate to="/pos" replace />;
  }

  const shiftId = shift.id;

  async function submit() {
    try {
      await closeMut.mutateAsync({ shiftId, declaredCash: declared || '0' });
      notify.success(t('close.done'));
      setDeclared('');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <Button asChild variant="outline" size="sm">
        <Link to="/pos">{t('shell.nav_gate')}</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('close.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">{t('close.declared')}</label>
            <MoneyInput value={declared} onChange={setDeclared} />
          </div>
          <Button type="button" onClick={() => void submit()} disabled={!canClose || closeMut.isPending}>
            {t('close.submit')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { ShiftCloseForm } from '../components/ShiftCloseForm';
import { useCurrentShift } from '../queries';
import { usePosTerminalStore } from '../stores/posTerminalStore';

export default function ShiftClose() {
  const { t } = useTranslation('pos');
  const { activeTerminalId: terminalId } = usePosTerminalStore();
  const { data: shift } = useCurrentShift(terminalId);

  if (!terminalId) {
    return <Navigate to="/pos" replace />;
  }
  if (!shift) {
    return <Navigate to="/pos" replace />;
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
        <CardContent>
          <ShiftCloseForm />
        </CardContent>
      </Card>
    </div>
  );
}

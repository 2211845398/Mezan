import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Select, type SelectOption } from '@/components/shared/form/Select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { formatDateTime, fromISO } from '@/lib/date';
import { notify } from '@/lib/toast';

import { useCurrentShift, useOpenShift, useTerminalsForBranch } from '../queries';
import { usePosTerminalStore } from '../stores/posTerminalStore';

export default function ShiftGate() {
  const { t } = useTranslation('pos');
  const navigate = useNavigate();
  const branchId = useAuthStore((s) => s.activeBranchId);
  const canReadShift = usePermission('pos_shifts', 'read');
  const canOpen = usePermission('pos_shifts', 'open');

  const { activeTerminalId, setActiveTerminalId } = usePosTerminalStore();
  const { data: terminals, isLoading: loadingTerms } = useTerminalsForBranch(branchId);
  const { data: shift, isLoading: loadingShift } = useCurrentShift(activeTerminalId);
  const openShift = useOpenShift();

  const [openingFloat, setOpeningFloat] = useState('0');

  useEffect(() => {
    if (!terminals?.length) return;
    if (activeTerminalId && terminals.some((x) => x.id === activeTerminalId)) return;
    setActiveTerminalId(terminals[0]?.id ?? null);
  }, [terminals, activeTerminalId, setActiveTerminalId]);

  /** Open shift → register is the primary surface; avoid leaving operators on `/pos`. */
  useEffect(() => {
    if (!canReadShift) return;
    if (loadingShift) return;
    if (shift) {
      navigate('/pos/register', { replace: true });
    }
  }, [canReadShift, loadingShift, navigate, shift]);

  const termOptions: SelectOption[] =
    terminals?.map((x) => ({
      value: String(x.id),
      label: x.name ?? t('gate.device_fallback', { id: x.id }),
    })) ?? [];

  async function onOpenShift() {
    if (!activeTerminalId) {
      notify.error(t('gate.select_terminal'));
      return;
    }
    try {
      await openShift.mutateAsync({
        terminal_id: activeTerminalId,
        opening_float: openingFloat || '0',
      });
      notify.success(t('gate.shift_open'));
      navigate('/pos/register');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (!canReadShift) {
    return <p className="p-6 text-sm text-muted-foreground">403</p>;
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl items-center justify-center p-6">
      <div className="grid w-full gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="border-primary/10 bg-primary text-primary-foreground shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">{t('shell.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-primary-foreground/80">
            <p>{t('gate.start_hint')}</p>
            <p>{t('gate.branch_hint')}</p>
          </CardContent>
        </Card>
        <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t('gate.select_terminal')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingTerms ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : !terminals?.length ? (
            <p className="text-sm text-destructive">{t('gate.no_terminals')}</p>
          ) : (
            <Select
              value={activeTerminalId != null ? String(activeTerminalId) : undefined}
              onChange={(v) => setActiveTerminalId(v ? Number.parseInt(v, 10) : null)}
              options={termOptions}
              aria-label={t('gate.select_terminal')}
            />
          )}
        </CardContent>
      </Card>

      {loadingShift ? <p className="text-sm text-muted-foreground">…</p> : null}

      {shift ? (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('gate.shift_open')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('gate.opened_at', { at: formatDateTime(fromISO(shift.opened_at)) })}
            </p>
            <Button asChild>
              <Link to="/pos/register">{t('gate.go_register')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('gate.open_shift')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('gate.opening_float')}</label>
              <MoneyInput value={openingFloat} onChange={setOpeningFloat} />
            </div>
            <Button type="button" onClick={() => void onOpenShift()} disabled={!canOpen || openShift.isPending}>
              {t('gate.open_shift')}
            </Button>
          </CardContent>
        </Card>
      )}
        </div>
      </div>
    </div>
  );
}

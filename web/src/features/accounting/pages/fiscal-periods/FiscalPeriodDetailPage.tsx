import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  outlineCancelMatchDestructiveClassName,
  outlineCancelMatchDestructiveSmClassName,
  outlineCancelMatchPrimaryClassName,
  outlineCancelMatchPrimarySmClassName,
} from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatMoney } from '@/lib/format';

import type { FiscalPeriodDetailRead } from '../../api';
import { updateFiscalPeriod } from '../../api';
import { accountingKeys, fiscalPeriodDetailQueryOptions } from '../../queries';

function periodDateSlice(value: string | undefined | null): string {
  return value?.slice(0, 10) ?? '';
}

export default function FiscalPeriodDetailPage() {
  const { periodKey = '' } = useParams<{ periodKey: string }>();
  const { t } = useTranslation('accounting');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = usePermission('accounting', 'update');
  const { data, isLoading, isError, refetch } = useQuery(fiscalPeriodDetailQueryOptions(periodKey));
  const [closeOpen, setCloseOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);
  const [softCloseOpen, setSoftCloseOpen] = useState(false);

  const mStatus = useMutation({
    mutationFn: (status: 'open' | 'soft_closed' | 'closed') =>
      updateFiscalPeriod(periodKey, { status }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountingKeys.fiscal() });
      await refetch();
      toast.success(t('fiscal.saved_ok', { defaultValue: 'Updated' }));
      setCloseOpen(false);
      setOpenOpen(false);
      setSoftCloseOpen(false);
    },
    onError: (error) => notifyApiError(error, t('fiscal.transition_error')),
  });

  const tbColumns = useMemo(
    () =>
      defineColumns<NonNullable<FiscalPeriodDetailRead['trial_balance']>[number]>()([
        { id: 'code', accessorKey: 'code', header: t('fiscal.col_tb_code') },
        { id: 'name', accessorKey: 'name', header: t('fiscal.col_tb_name') },
        {
          id: 'debit',
          header: t('fiscal.col_tb_debit'),
          cell: ({ row }) => (
            <span className="tabular-nums num-latin">{formatMoney(row.original.total_debit)}</span>
          ),
        },
        {
          id: 'credit',
          header: t('fiscal.col_tb_credit'),
          cell: ({ row }) => (
            <span className="tabular-nums num-latin">{formatMoney(row.original.total_credit)}</span>
          ),
        },
        {
          id: 'net',
          header: t('fiscal.col_tb_net'),
          cell: ({ row }) => (
            <span className="tabular-nums num-latin">{formatMoney(row.original.net)}</span>
          ),
        },
      ]),
    [t],
  );

  const slColumns = useMemo(
    () =>
      defineColumns<NonNullable<FiscalPeriodDetailRead['subledger_activity']>[number]>()([
        { id: 'code', accessorKey: 'code', header: t('fiscal.col_tb_code') },
        { id: 'name', accessorKey: 'name', header: t('fiscal.col_tb_name') },
        { id: 'kind', accessorKey: 'subledger_kind', header: t('fiscal.col_sl_kind') },
        { id: 'lines', accessorKey: 'line_count', header: t('fiscal.col_sl_lines') },
        {
          id: 'net',
          header: t('fiscal.col_tb_net'),
          cell: ({ row }) => (
            <span className="tabular-nums num-latin">{formatMoney(row.original.net)}</span>
          ),
        },
      ]),
    [t],
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">{t('coa.loading')}</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Button type="button" variant="outline" onClick={() => navigate('/accounting/fiscal-periods')}>
          {t('fiscal.back')}
        </Button>
        <p className="text-sm text-destructive">{t('errors.load_failed', { ns: 'common' })}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('fiscal.detail_title', { key: data.period_key })}
        actions={
          <Button type="button" variant="outline" asChild>
            <Link to="/accounting/fiscal-periods">{t('fiscal.back')}</Link>
          </Button>
        }
      />

      <SectionCard title={t('fiscal.posting_status')}>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('fiscal.col.status')}</p>
            <StatusBadge
              status={data.status}
              label={t(`fiscal.status_label.${data.status}`, data.status)}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('fiscal.col.start')}</p>
            <p className="num-latin">{periodDateSlice(data.period_start)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('fiscal.col.end')}</p>
            <p className="num-latin">{periodDateSlice(data.period_end)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('fiscal.col.closed_at')}</p>
            <p className="num-latin">{periodDateSlice(data.closed_at) || '—'}</p>
          </div>
          {data.closed_by_name ? (
            <div>
              <p className="text-xs text-muted-foreground">{t('fiscal.closed_by')}</p>
              <p>{data.closed_by_name}</p>
            </div>
          ) : null}
          <div className="md:col-span-2">
            <p className="text-xs text-muted-foreground">{t('fiscal.posting_status')}</p>
            <p>{data.can_post ? t('fiscal.can_post_yes') : t('fiscal.can_post_no')}</p>
            <p className="text-sm text-muted-foreground">{data.posting_reason}</p>
          </div>
        </div>

        {can ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.status === 'open' ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={outlineCancelMatchPrimarySmClassName}
                  onClick={() => setSoftCloseOpen(true)}
                >
                  {t('fiscal.soft_close')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={outlineCancelMatchDestructiveSmClassName}
                  onClick={() => setCloseOpen(true)}
                >
                  {t('fiscal.close')}
                </Button>
              </>
            ) : null}
            {data.status !== 'open' ? (
              <Button
                type="button"
                size="sm"
                className={outlineCancelMatchPrimarySmClassName}
                onClick={() => setOpenOpen(true)}
              >
                {t('fiscal.reopen')}
              </Button>
            ) : null}
            {data.status === 'soft_closed' ? (
              <Button
                type="button"
                size="sm"
                className={outlineCancelMatchDestructiveSmClassName}
                onClick={() => setCloseOpen(true)}
              >
                {t('fiscal.close')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={t('fiscal.open_items')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">{t('fiscal.ar_open')}</p>
            <p className="text-2xl tabular-nums num-latin">{data.ar_open_items_count}</p>
            <p className="text-sm text-muted-foreground tabular-nums num-latin">
              {formatMoney(data.ar_open_amount)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">{t('fiscal.ap_open')}</p>
            <p className="text-2xl tabular-nums num-latin">{data.ap_open_items_count}</p>
            <p className="text-sm text-muted-foreground tabular-nums num-latin">
              {formatMoney(data.ap_open_amount)}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('fiscal.subledger_activity')}>
        <DataTable
          mode="client"
          columns={slColumns}
          data={data.subledger_activity}
          showSearch={false}
          emptyMessage="—"
        />
      </SectionCard>

      <SectionCard title={t('fiscal.trial_balance')}>
        <DataTable
          mode="client"
          columns={tbColumns}
          data={data.trial_balance}
          searchPlaceholder={t('fiscal.search_placeholder')}
        />
      </SectionCard>

      <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fiscal.close_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('fiscal.close_confirm_body_simple')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              className={outlineCancelMatchDestructiveClassName}
              disabled={mStatus.isPending}
              onClick={() => mStatus.mutate('closed')}
            >
              {t('fiscal.close')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={softCloseOpen} onOpenChange={setSoftCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fiscal.soft_close')}</AlertDialogTitle>
            <AlertDialogDescription>{t('fiscal.close_confirm_body_simple')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              className={outlineCancelMatchPrimaryClassName}
              disabled={mStatus.isPending}
              onClick={() => mStatus.mutate('soft_closed')}
            >
              {t('fiscal.soft_close')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openOpen} onOpenChange={setOpenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fiscal.reopen_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('fiscal.reopen_confirm_body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              className={outlineCancelMatchPrimaryClassName}
              disabled={mStatus.isPending}
              onClick={() => mStatus.mutate('open')}
            >
              {t('fiscal.reopen')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

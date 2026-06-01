import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
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
import type { FiscalPeriodRead } from '../../api';
import { updateFiscalPeriod } from '../../api';
import { accountingKeys, fiscalPeriodsQueryOptions } from '../../queries';

type FiscalPeriodRow = FiscalPeriodRead & {
  period_start?: string;
  period_end?: string;
  closed_at?: string;
};

function periodDateSlice(value: string | undefined): string {
  return value?.slice(0, 10) ?? '';
}

export default function FiscalPeriodsList() {
  const { t } = useTranslation('accounting');
  const qc = useQueryClient();
  const can = usePermission('accounting', 'update');
  const { data: rows = [], isLoading, isError, refetch } = useQuery(fiscalPeriodsQueryOptions());
  const [closePk, setClosePk] = useState<string | null>(null);
  const [openPk, setOpenPk] = useState<string | null>(null);

  const mClose = useMutation({
    mutationFn: (pk: string) => updateFiscalPeriod(pk, { status: 'closed' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountingKeys.fiscal() });
      toast.success(t('fiscal.closed_ok'));
      setClosePk(null);
    },
    onError: (error) => notifyApiError(error, t('fiscal.transition_error')),
  });
  const mOpen = useMutation({
    mutationFn: (pk: string) => updateFiscalPeriod(pk, { status: 'open' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountingKeys.fiscal() });
      toast.success(t('fiscal.reopened_ok'));
      setOpenPk(null);
    },
    onError: (error) => notifyApiError(error, t('fiscal.transition_error')),
  });

  const columns = useMemo(
    () =>
      defineColumns<FiscalPeriodRead>()([
        { id: 'key', accessorKey: 'period_key', header: t('fiscal.col.key') },
        {
          id: 'start',
          header: t('fiscal.col.start'),
          accessorFn: (row) => periodDateSlice((row as FiscalPeriodRow).period_start),
          cell: ({ row }) => periodDateSlice((row.original as FiscalPeriodRow).period_start) || '—',
        },
        {
          id: 'end',
          header: t('fiscal.col.end'),
          accessorFn: (row) => periodDateSlice((row as FiscalPeriodRow).period_end),
          cell: ({ row }) => periodDateSlice((row.original as FiscalPeriodRow).period_end) || '—',
        },
        {
          id: 's',
          accessorKey: 'status',
          header: t('fiscal.col.status'),
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.status}
              label={t(`fiscal.status_label.${row.original.status}`, row.original.status)}
            />
          ),
        },
        {
          id: 'closed_at',
          header: t('fiscal.col.closed_at'),
          accessorFn: (row) => periodDateSlice((row as FiscalPeriodRow).closed_at),
          cell: ({ row }) => periodDateSlice((row.original as FiscalPeriodRow).closed_at) || '—',
        },
        {
          id: 'a',
          header: '',
          cell: ({ row }) => {
            const r = row.original;
            if (!can) return null;
            if (r.status === 'open') {
              return (
                <Button
                  type="button"
                  size="sm"
                  className={outlineCancelMatchDestructiveSmClassName}
                  onClick={() => setClosePk(r.period_key)}
                >
                  {t('fiscal.close')}
                </Button>
              );
            }
            return (
              <Button
                type="button"
                size="sm"
                className={outlineCancelMatchPrimarySmClassName}
                onClick={() => setOpenPk(r.period_key)}
              >
                {t('fiscal.reopen')}
              </Button>
            );
          },
        },
      ]),
    [can, t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('fiscal.title')} />
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        searchPlaceholder={t('fiscal.search_placeholder')}
      />

      {/* Close confirmation — simple yes/no, no typed keyword */}
      <AlertDialog open={closePk != null} onOpenChange={(o) => { if (!o) setClosePk(null); }}>
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
              disabled={mClose.isPending}
              onClick={() => closePk && mClose.mutate(closePk)}
            >
              {t('fiscal.close')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen confirmation */}
      <AlertDialog open={openPk != null} onOpenChange={(o) => { if (!o) setOpenPk(null); }}>
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
              disabled={mOpen.isPending}
              onClick={() => openPk && mOpen.mutate(openPk)}
            >
              {t('fiscal.reopen')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

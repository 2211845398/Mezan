import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DangerConfirmDialog } from '@/features/admin/components/DangerConfirmDialog';
import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import type { FiscalPeriodRead } from '../../api';
import { updateFiscalPeriod } from '../../api';
import { fiscalPeriodsQueryOptions, accountingKeys } from '../../queries';

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
    onError: () => toast.error(t('errors.generic')),
  });
  const mOpen = useMutation({
    mutationFn: (pk: string) => updateFiscalPeriod(pk, { status: 'open' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountingKeys.fiscal() });
      toast.success(t('fiscal.reopened_ok'));
      setOpenPk(null);
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const columns = useMemo(
    () =>
      defineColumns<FiscalPeriodRead>()([
        { id: 'key', accessorKey: 'period_key', header: t('fiscal.col.key') },
        { id: 's', accessorKey: 'status', header: t('fiscal.col.status') },
        {
          id: 'a',
          header: '',
          cell: ({ row }) => {
            const r = row.original;
            if (!can) return null;
            if (r.status === 'open') {
              return (
                <Button type="button" size="sm" variant="destructive" onClick={() => setClosePk(r.period_key)}>
                  {t('fiscal.close')}
                </Button>
              );
            }
            return (
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpenPk(r.period_key)}>
                {t('fiscal.reopen')}
              </Button>
            );
          },
        },
      ]),
    [can, t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('fiscal.title')}</h1>
      <p className="max-w-xl text-sm text-muted-foreground">{t('fiscal.hint')}</p>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
      <DangerConfirmDialog
        open={closePk != null}
        onOpenChange={(o) => {
          if (!o) setClosePk(null);
        }}
        title={t('fiscal.close_confirm_title')}
        description={t('fiscal.close_confirm_body')}
        confirmKeyword="CLOSE"
        onConfirm={() => closePk && mClose.mutate(closePk)}
        isLoading={mClose.isPending}
      />
      <DangerConfirmDialog
        open={openPk != null}
        onOpenChange={(o) => {
          if (!o) setOpenPk(null);
        }}
        title={t('fiscal.reopen_confirm_title')}
        description={t('fiscal.reopen_confirm_body')}
        confirmKeyword="REOPEN"
        onConfirm={() => openPk && mOpen.mutate(openPk)}
        isLoading={mOpen.isPending}
      />
    </div>
  );
}

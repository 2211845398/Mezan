import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';

import type { CurrencyRead } from '../../api';
import {
  createCurrency,
  updateAccountingSettings,
  updateCurrencyRate,
} from '../../api';
import {
  accountingKeys,
  accountingSettingsQueryOptions,
  currenciesQueryOptions,
} from '../../queries';

function CurrencyAddForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('accounting');
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');

  const save = useMutation({
    mutationFn: () =>
      createCurrency({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        exchange_rate_to_base: rate.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountingKeys.currencies() });
      toast.success(t('currencies.created'));
      onDone();
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <form
      className="flex flex-col gap-3 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-2">
        <Label>{t('currencies.form.code')}</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={3} placeholder="LYD" />
      </div>
      <div className="grid gap-2">
        <Label>{t('currencies.form.name')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('currencies.form.rate')}</Label>
        <MoneyInput value={rate} onValueChange={setRate} />
        <p className="text-xs text-muted-foreground">{t('currencies.form.rate_hint')}</p>
      </div>
      <Button type="submit" disabled={save.isPending || !code.trim() || !name.trim()}>
        {t('currencies.form.save')}
      </Button>
    </form>
  );
}

export default function CurrenciesPage() {
  const { t } = useTranslation('accounting');
  const qc = useQueryClient();
  const canUpdate = usePermission('accounting', 'update');
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [rateEdit, setRateEdit] = useState<CurrencyRead | null>(null);
  const [rateValue, setRateValue] = useState('');
  const [baseConfirm, setBaseConfirm] = useState<number | null>(null);

  const { data: rows = [], isLoading, isError, refetch } = useQuery(currenciesQueryOptions(true));
  const { data: settings } = useQuery(accountingSettingsQueryOptions());

  const rateMutation = useMutation({
    mutationFn: () => updateCurrencyRate(rateEdit!.id, rateValue),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountingKeys.currencies() });
      toast.success(t('currencies.rate_updated'));
      setRateEdit(null);
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const baseMutation = useMutation({
    mutationFn: (id: number) => updateAccountingSettings({ base_currency_id: id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountingKeys.root });
      toast.success(t('currencies.base_updated'));
      setBaseConfirm(null);
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  const columns = useMemo(
    () =>
      defineColumns<CurrencyRead>()([
        { id: 'code', accessorKey: 'code', header: t('currencies.col.code') },
        { id: 'name', accessorKey: 'name', header: t('currencies.col.name') },
        {
          id: 'rate',
          header: t('currencies.col.rate'),
          cell: ({ row }) => {
            if (row.original.is_base) return '1';
            return row.original.exchange_rate_to_base ?? '—';
          },
        },
        {
          id: 'base',
          header: t('currencies.col.base'),
          cell: ({ row }) => (row.original.is_base ? t('currencies.base_badge') : '—'),
        },
        {
          id: 'active',
          accessorKey: 'active',
          header: t('currencies.col.active'),
          cell: ({ row }) => (row.original.active ? t('currencies.yes') : t('currencies.no')),
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            canUpdate ? (
              <div className="flex gap-1">
                {!row.original.is_base ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRateEdit(row.original);
                      setRateValue(String(row.original.exchange_rate_to_base ?? ''));
                    }}
                  >
                    {t('currencies.edit_rate')}
                  </Button>
                ) : null}
                {!row.original.is_base && row.original.active ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setBaseConfirm(row.original.id)}
                  >
                    {t('currencies.set_base')}
                  </Button>
                ) : null}
              </div>
            ) : null,
        },
      ]),
    [canUpdate, t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('currencies.title')}
        actions={
          canUpdate ? (
            <Button
              type="button"
              onClick={() => {
                setAddKey((k) => k + 1);
                setAddOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t('currencies.add')}
            </Button>
          ) : null
        }
      />

      {settings ? (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <span className="text-muted-foreground">{t('currencies.current_base')}: </span>
          <span className="font-medium">
            {settings.base_currency_code} — {settings.base_currency_name}
          </span>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyMessage={t('currencies.empty')}
      />

      <FloatingFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title={t('currencies.add')}
        key={addKey}
      >
        <CurrencyAddForm onDone={() => setAddOpen(false)} />
      </FloatingFormDialog>

      <FloatingFormDialog
        open={rateEdit != null}
        onOpenChange={(o) => !o && setRateEdit(null)}
        title={t('currencies.edit_rate_title', { code: rateEdit?.code ?? '' })}
      >
        <form
          className="flex flex-col gap-3 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            rateMutation.mutate();
          }}
        >
          <MoneyInput value={rateValue} onValueChange={setRateValue} />
          <Button type="submit" disabled={rateMutation.isPending || !rateValue.trim()}>
            {t('currencies.form.save')}
          </Button>
        </form>
      </FloatingFormDialog>

      <AlertDialog open={baseConfirm != null} onOpenChange={(o) => !o && setBaseConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('currencies.base_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('currencies.base_confirm_body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => baseConfirm != null && baseMutation.mutate(baseConfirm)}
            >
              {t('currencies.base_confirm_action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

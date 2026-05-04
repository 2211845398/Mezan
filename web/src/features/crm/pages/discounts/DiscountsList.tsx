import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { fromISO } from '@/lib/date';
import { notify } from '@/lib/toast';

import type { DiscountRuleRead } from '../../api';
import { updateDiscountRule } from '../../api';
import { crmKeys, discountsListQueryOptions } from '../../queries';

function sortDiscounts(rows: DiscountRuleRead[]): DiscountRuleRead[] {
  return [...rows].sort((a, b) => {
    const ta = fromISO(a.start_date).getTime();
    const tb = fromISO(b.start_date).getTime();
    if (tb !== ta) return tb - ta;
    return a.code.localeCompare(b.code);
  });
}

export default function DiscountsList() {
  const { t } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const canCreate = usePermission('discounts', 'create');
  const canUpdate = usePermission('discounts', 'update');
  const { data: raw = [], isLoading, isError, refetch } = useQuery(
    discountsListQueryOptions({ limit: 100, offset: 0 }),
  );
  const rows = useMemo(() => sortDiscounts(raw), [raw]);

  const mToggle = useMutation({
    mutationFn: async (r: DiscountRuleRead) => {
      const next = r.status === 'active' ? 'disabled' : 'active';
      return updateDiscountRule(r.id, { status: next });
    },
    onMutate: async (r) => {
      await qc.cancelQueries({ queryKey: crmKeys.discounts({ limit: 100, offset: 0 }) });
      const prev = qc.getQueryData<DiscountRuleRead[]>(crmKeys.discounts({ limit: 100, offset: 0 }));
      qc.setQueryData<DiscountRuleRead[]>(crmKeys.discounts({ limit: 100, offset: 0 }), (old) =>
        (old ?? []).map((x) =>
          x.id === r.id ? { ...x, status: x.status === 'active' ? 'disabled' : 'active' } : x,
        ),
      );
      return { prev };
    },
    onError: (error, _r, ctx) => {
      if (ctx?.prev) qc.setQueryData(crmKeys.discounts({ limit: 100, offset: 0 }), ctx.prev);
      notifyApiError(error, t('errors.generic'));
    },
    onSuccess: () => {
      notify.success(tc('toasts.saved'));
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: crmKeys.root });
    },
  });

  const columns = useMemo(
    () =>
      defineColumns<DiscountRuleRead>()([
        { id: 'c', accessorKey: 'code', header: t('discounts.col.code') },
        { id: 'n', accessorKey: 'name', header: t('discounts.col.name') },
        { id: 'ty', accessorKey: 'discount_type', header: t('discounts.col.type') },
        { id: 'st', accessorKey: 'status', header: t('discounts.col.status') },
        {
          id: 'sd',
          accessorKey: 'start_date',
          header: t('discounts.col.start'),
          cell: ({ row }) => row.original.start_date.slice(0, 10),
        },
        {
          id: 'to',
          header: '',
          cell: ({ row }) =>
            canUpdate ? (
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={mToggle.isPending}
                  onClick={() => void mToggle.mutate(row.original)}
                >
                  {row.original.status === 'active' ? t('discounts.deactivate') : t('discounts.activate')}
                </Button>
                <Button type="button" size="icon" variant="ghost" asChild>
                  <Link to={`/crm/discounts/${row.original.id}/edit`} aria-label={t('discounts.edit')}>
                    <Pencil className="size-4" />
                  </Link>
                </Button>
              </div>
            ) : null,
        },
      ]),
    [canUpdate, mToggle, t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('discounts.title')}</h1>
        {canCreate ? (
          <Button asChild>
            <Link to="/crm/discounts/new">{t('discounts.new')}</Link>
          </Button>
        ) : null}
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}

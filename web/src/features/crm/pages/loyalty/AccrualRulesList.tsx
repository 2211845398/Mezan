import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import type { AccrualRuleRead } from '../../api';
import { accrualRulesQueryOptions } from '../../queries';

export default function AccrualRulesList() {
  const { t } = useTranslation('crm');
  const canCreate = usePermission('loyalty', 'create');
  const canUpdate = usePermission('loyalty', 'update');
  const { data: rows = [], isLoading, isError, refetch } = useQuery(accrualRulesQueryOptions());

  const columns = useMemo(
    () =>
      defineColumns<AccrualRuleRead>()([
        { id: 'n', accessorKey: 'name', header: t('loyalty.rule.name') },
        { id: 'p', accessorKey: 'points_per_unit', header: t('loyalty.rule.points_per_unit') },
        {
          id: 'c',
          accessorKey: 'currency_per_point',
          header: t('loyalty.rule.currency_per_point'),
        },
        {
          id: 'a',
          accessorKey: 'is_active',
          header: t('loyalty.rule.active'),
          cell: ({ row }) => (row.original.is_active ? t('customers.yes') : t('customers.no')),
        },
        {
          id: 'e',
          header: '',
          cell: ({ row }) =>
            canUpdate ? (
              <Button type="button" size="icon" variant="ghost" asChild>
                <Link to={`/crm/loyalty/${row.original.id}/edit`} aria-label={t('loyalty.rule.edit')}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            ) : null,
        },
      ]),
    [canUpdate, t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t('loyalty.rules_title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('loyalty.rules_hint')}</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link to="/crm/loyalty/new">{t('loyalty.rule.new')}</Link>
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

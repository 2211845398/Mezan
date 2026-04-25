import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import type { EmployeeProfileRead } from '../../api';
import { employeesQueryOptions } from '../../queries';

export default function EmployeesList() {
  const { t } = useTranslation('hr');
  const canCreate = usePermission('employees', 'create');
  const canUpdate = usePermission('employees', 'update');
  const { data: rows = [], isLoading, isError, refetch } = useQuery(employeesQueryOptions());

  const columns = useMemo(
    () =>
      defineColumns<EmployeeProfileRead>()([
        { id: 'id', accessorKey: 'id', header: t('employees.col.id') },
        { id: 'user_id', accessorKey: 'user_id', header: t('employees.col.user_id') },
        { id: 'hire_date', header: t('employees.col.hire_date'), cell: ({ row }) => row.original.hire_date },
        {
          id: 'hourly_rate',
          header: t('employees.col.hourly_rate'),
          cell: ({ row }) => row.original.hourly_rate ?? '—',
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            canUpdate ? (
              <Button type="button" size="icon" variant="ghost" asChild>
                <Link
                  to={`/hr/employees/${row.original.id}/edit`}
                  aria-label={t('employees.edit')}
                >
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
        <h1 className="text-xl font-semibold">{t('employees.title')}</h1>
        {canCreate ? (
          <Button asChild>
            <Link to="/hr/employees/new">
              <Plus className="me-2 size-4" />
              {t('employees.new')}
            </Link>
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

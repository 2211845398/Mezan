import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import { getBranchDisplayName } from '../../lib/branchLabels';
import { useBranches, useTerminals } from '../../queries';
import type { TerminalRead } from '../../types';
import { TerminalForm } from './TerminalForm';

export default function TerminalsList() {
  const { t } = useTranslation('admin');
  const { data: terms = [], isLoading, isError, refetch } = useTerminals();
  const { data: branches = [] } = useBranches(false);
  const canCreate = usePermission('terminals', 'create');
  const [formOpen, setFormOpen] = useState(false);

  const columns = useMemo(
    () =>
      defineColumns<TerminalRead>()([
        { id: 'terminal_code', accessorKey: 'terminal_code', header: t('terminals.col.code') },
        { id: 'name', accessorKey: 'name', header: t('terminals.col.name') },
        {
          id: 'branch',
          header: t('terminals.col.branch'),
          cell: ({ row }) =>
            getBranchDisplayName(branches, row.original.branch_id, row.original.branch_name),
        },
        {
          id: 'status',
          header: t('terminals.col.status'),
          cell: ({ row }) =>
            row.original.is_authorized
              ? t('terminals.status.authorized')
              : t('terminals.status.unauthorized'),
        },
      ]),
    [t, branches],
  );

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('terminals.title')}</h1>
        {canCreate ? (
          <Button
            onClick={() => {
              setFormOpen(true);
            }}
          >
            {t('terminals.create')}
          </Button>
        ) : null}
      </div>
      <DataTable
        mode="client"
        showSearch={false}
        columns={columns}
        data={terms}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t('terminals.empty')}</p>}
        getRowHref={(t) => `/admin/terminals/${t.id}`}
      />
      <TerminalForm open={formOpen} onOpenChange={setFormOpen} terminal={null} />
    </div>
  );
}

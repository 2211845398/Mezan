import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import { getBranchLabel } from '../../lib/branchLabels';
import { useBranches, useTerminals } from '../../queries';
import type { TerminalRead } from '../../types';
import { TerminalForm } from './TerminalForm';

export default function TerminalsList() {
  const { t } = useTranslation('admin');
  const { data: terms = [], isLoading, isError, refetch } = useTerminals();
  const { data: branches = [] } = useBranches(false);
  const canCreate = usePermission('terminals', 'create');
  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<TerminalRead | null>(null);

  const columns = useMemo(
    () =>
      defineColumns<TerminalRead>()([
        { id: 'terminal_code', accessorKey: 'terminal_code', header: t('terminals.col.code') },
        { id: 'name', accessorKey: 'name', header: t('terminals.col.name') },
        {
          id: 'branch',
          header: t('terminals.col.branch'),
          cell: ({ row }) => getBranchLabel(branches, row.original.branch_id),
        },
        {
          id: 'status',
          header: t('terminals.col.status'),
          cell: ({ row }) =>
            row.original.is_authorized
              ? t('terminals.status.authorized')
              : t('terminals.status.unauthorized'),
        },
        {
          id: 'row',
          cell: ({ row }) => (
            <Button type="button" size="sm" variant="secondary" onClick={() => { setEdit(row.original); setFormOpen(true); }}>
              {t('actions.edit')}
            </Button>
          ),
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
              setEdit(null);
              setFormOpen(true);
            }}
          >
            {t('terminals.create')}
          </Button>
        ) : null}
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={terms}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t('terminals.empty')}</p>}
      />
      <TerminalForm open={formOpen} onOpenChange={setFormOpen} terminal={edit} />
    </div>
  );
}

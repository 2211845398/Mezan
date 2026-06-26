import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { useBranches, useCreateBranch } from '../../queries';
import type { BranchRead } from '../../types';
import { BranchForm } from './BranchForm';

export default function BranchesList() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: rows = [], isLoading, isError, refetch } = useBranches(includeArchived);
  const canCreate = usePermission('branches', 'create');
  const [formOpen, setFormOpen] = useState(false);
  const createB = useCreateBranch();

  const columns = useMemo(
    () =>
      defineColumns<BranchRead>()([
        { id: 'code', accessorKey: 'code', header: t('branches.col.code') },
        { id: 'name', accessorKey: 'name', header: t('branches.col.name') },
        {
          id: 'kind',
          header: t('branches.col.kind'),
          cell: ({ row }) =>
            row.original.kind === 'warehouse'
              ? t('branches.kind.warehouse')
              : t('branches.kind.commercial'),
        },
        {
          id: 'archived',
          header: t('branches.col.state'),
          cell: ({ row }) => (row.original.archived_at ? t('branches.state.archived') : t('branches.state.active')),
        },
      ]),
    [t],
  );

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('branches.title')}</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="arch"
              checked={includeArchived}
              onCheckedChange={setIncludeArchived}
            />
            <Label htmlFor="arch">{t('branches.include_archived')}</Label>
          </div>
          {canCreate ? (
            <Button
              onClick={() => {
                setFormOpen(true);
              }}
            >
              {t('branches.create')}
            </Button>
          ) : null}
        </div>
      </div>
      <DataTable
        mode="client"
        showSearch={false}
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t('branches.empty')}</p>}
        getRowHref={(b) => `/admin/branches/${b.id}`}
      />
      <BranchForm
        open={formOpen}
        onOpenChange={setFormOpen}
        mode="create"
        branch={null}
        isSubmitting={createB.isPending}
        onSubmit={async (v) => {
          try {
            await createB.mutateAsync({
              name: v.name,
              code: v.code,
              timezone: v.timezone,
              address: v.address == null ? null : v.address,
              kind: v.kind,
            });
            notify.success(tc('toasts.saved'));
            setFormOpen(false);
          } catch (error) {
            notifyApiError(error, t('errors.generic', { ns: 'common' }));
          }
        }}
      />
    </div>
  );
}

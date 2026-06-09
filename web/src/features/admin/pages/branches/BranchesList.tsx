import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  floatingFormApproveButtonSmClassName,
  floatingFormCloseButtonSmClassName,
  floatingFormDangerButtonSmClassName,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { updateBranch } from '../../api';
import { DangerConfirmDialog } from '../../components/DangerConfirmDialog';
import { adminKeys, useArchiveBranch, useBranches, useCreateBranch, useUpdateBranch } from '../../queries';
import type { BranchRead } from '../../types';
import { BranchForm } from './BranchForm';

export default function BranchesList() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: rows = [], isLoading, isError, refetch } = useBranches(includeArchived);
  const canCreate = usePermission('branches', 'create');
  const canUpdate = usePermission('branches', 'update');
  const canDelete = usePermission('branches', 'delete');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<BranchRead | null>(null);
  const [archiving, setArchiving] = useState<BranchRead | null>(null);
  const createB = useCreateBranch();
  const updateB = useUpdateBranch(selected?.id ?? 0);
  const archive = useArchiveBranch(includeArchived);
  const qc = useQueryClient();
  const unarchive = useMutation({
    mutationFn: (branchId: number) => updateBranch(branchId, { unarchive: true }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.branches(includeArchived) });
      await qc.invalidateQueries({ queryKey: adminKeys.branches(!includeArchived) });
    },
  });

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
        {
          id: 'actions',
          cell: ({ row }) => {
            const b = row.original;
            return (
              <div className="flex flex-wrap gap-1">
                {canUpdate ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={floatingFormCloseButtonSmClassName}
                    onClick={() => {
                      setFormMode('edit');
                      setSelected(b);
                      setFormOpen(true);
                    }}
                  >
                    {t('actions.edit')}
                  </Button>
                ) : null}
                {canDelete && !b.archived_at ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className={floatingFormDangerButtonSmClassName}
                    onClick={() => setArchiving(b)}
                  >
                    {t('branches.archive')}
                  </Button>
                ) : null}
                {canUpdate && b.archived_at ? (
                  <Button
                    type="button"
                    variant="default"
                    className={floatingFormApproveButtonSmClassName}
                    onClick={() =>
                      void unarchive
                        .mutateAsync(b.id)
                        .then(() => notify.success(tc('toasts.restored')))
                        .catch((error) => notifyApiError(error, t('errors.generic', { ns: 'common' })))
                    }
                    disabled={unarchive.isPending}
                  >
                    {t('branches.unarchive')}
                  </Button>
                ) : null}
              </div>
            );
          },
        },
      ]),
    [t, canUpdate, canDelete, unarchive, tc],
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
                setFormMode('create');
                setSelected(null);
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
      />
      <BranchForm
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        branch={formMode === 'edit' ? selected : null}
        isSubmitting={createB.isPending || updateB.isPending}
        onSubmit={async (v) => {
          try {
            if (formMode === 'create') {
              await createB.mutateAsync({
                name: v.name,
                code: v.code,
                timezone: v.timezone,
                address: v.address == null ? null : v.address,
                kind: v.kind,
              });
              notify.success(tc('toasts.saved'));
              setFormOpen(false);
            } else if (selected) {
              await updateB.mutateAsync({
                name: v.name,
                address: v.address == null ? null : v.address,
                timezone: v.timezone,
                kind: v.kind,
              });
              notify.success(tc('toasts.saved'));
              setFormOpen(false);
            }
          } catch (error) {
            notifyApiError(error, t('errors.generic', { ns: 'common' }));
          }
        }}
      />
      <DangerConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={t('branches.archive_title')}
        confirmKeyword={t('branches.archive_confirm_keyword')}
        isLoading={archive.isPending}
        onConfirm={async () => {
          if (!archiving) return;
          try {
            await archive.mutateAsync({ branchId: archiving.id });
            notify.success(tc('toasts.archived'));
            setArchiving(null);
          } catch (error) {
            notifyApiError(error, t('errors.generic', { ns: 'common' }));
          }
        }}
      />
    </div>
  );
}

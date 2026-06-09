import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PaginatedList } from '@/api/pagination';
import { paginatedParams } from '@/api/pagination';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
import { Pencil, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { notifyApiError } from '@/api/errorMessages';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  FloatingFormDialog,
  FloatingFormDialogFooter,
} from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { fromISO } from '@/lib/date';
import { notify } from '@/lib/toast';

import type { DiscountRuleRead } from '../../api';
import { updateDiscountRule } from '../../api';
import { crmKeys, discountsListQueryOptions } from '../../queries';
import DiscountForm, { DISCOUNT_DIALOG_FORM_ID } from './DiscountForm';

function sortDiscounts(rows: DiscountRuleRead[]): DiscountRuleRead[] {
  return [...rows].sort((a, b) => {
    const ta = fromISO(a.start_date).getTime();
    const tb = fromISO(b.start_date).getTime();
    if (tb !== ta) return tb - ta;
    return a.code.localeCompare(b.code);
  });
}

function formatDiscountValueDisplay(r: DiscountRuleRead): string {
  const dt = String(r.discount_type);
  if (dt === 'percentage') {
    const n = Number.parseFloat(String(r.value).replace(',', '.'));
    return Number.isFinite(n) ? `${n}%` : r.value;
  }
  if (dt === 'bogo') {
    const buy = r.buy_qty ?? '—';
    const get = r.get_qty ?? '—';
    return `${buy} → ${get}`;
  }
  return r.value;
}

export default function DiscountsList() {
  const { t } = useTranslation('crm');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const canCreate = usePermission('discounts', 'create');
  const canUpdate = usePermission('discounts', 'update');
  const [urlQuery] = useTableUrlState({ pageSize: 20 });
  const { limit, offset } = paginatedParams(urlQuery.page, urlQuery.pageSize);
  const listArgs = { limit, offset };

  const { data, isLoading, isError, refetch } = useQuery(discountsListQueryOptions(listArgs));
  const rows = useMemo(() => sortDiscounts(data?.items ?? []), [data?.items]);
  const totalRows = data?.total ?? 0;

  const openNew = searchParams.get('new') === '1';
  const rawEdit = searchParams.get('edit');
  const editIdFromUrl =
    !openNew && rawEdit && /^\d+$/.test(rawEdit) ? Number.parseInt(rawEdit, 10) : null;
  const formOpen = openNew || (editIdFromUrl != null && editIdFromUrl > 0);
  const dialogDiscountId = openNew ? null : editIdFromUrl;

  function closeDiscountForm() {
    void navigate('/crm/discounts', { replace: true });
  }

  const mToggle = useMutation({
    mutationFn: async (r: DiscountRuleRead) => {
      const next = r.status === 'active' ? 'disabled' : 'active';
      return updateDiscountRule(r.id, { status: next });
    },
    onMutate: async (r) => {
      await qc.cancelQueries({ queryKey: crmKeys.discounts(listArgs) });
      const prev = qc.getQueryData<PaginatedList<DiscountRuleRead>>(crmKeys.discounts(listArgs));
      qc.setQueryData<PaginatedList<DiscountRuleRead>>(crmKeys.discounts(listArgs), (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((x) =>
            x.id === r.id ? { ...x, status: x.status === 'active' ? 'disabled' : 'active' } : x,
          ),
        };
      });
      return { prev };
    },
    onError: (error, _r, ctx) => {
      if (ctx?.prev) qc.setQueryData(crmKeys.discounts(listArgs), ctx.prev);
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
        {
          id: 'val',
          accessorKey: 'value',
          header: t('discounts.col.discount_value'),
          cell: ({ row }) => formatDiscountValueDisplay(row.original),
        },
        {
          id: 'st',
          accessorKey: 'status',
          header: t('discounts.col.status'),
          cell: ({ row }) => {
            const s = row.original.status;
            return <StatusBadge status={s} label={t(`discounts.rule_status.${s}`)} />;
          },
        },
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
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t('discounts.edit')}
                  onClick={() => {
                    void navigate(`/crm/discounts?edit=${row.original.id}`);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
              </div>
            ) : null,
        },
      ]),
    [canUpdate, mToggle, navigate, t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('discounts.title')}
        actions={
          canCreate ? (
            <Button
              type="button"
              onClick={() => {
                void navigate('/crm/discounts?new=1');
              }}
            >
              <Plus className="me-2 size-4" />
              {t('discounts.new')}
            </Button>
          ) : null
        }
      />
      <DataTable
        mode="server"
        columns={columns}
        data={rows}
        totalRows={totalRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <FloatingFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          if (!o) closeDiscountForm();
        }}
        title={openNew ? t('discounts.new_title') : t('discounts.edit_title')}
        maxWidth="md"
        footer={
          <FloatingFormDialogFooter
            formId={DISCOUNT_DIALOG_FORM_ID}
            onCancel={closeDiscountForm}
            saveLabel={tc('actions.save')}
            cancelLabel={tc('actions.cancel')}
          />
        }
      >
        {formOpen ? (
          <DiscountForm
            key={searchParams.toString()}
            dialogDiscountId={dialogDiscountId}
            onDismiss={closeDiscountForm}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}

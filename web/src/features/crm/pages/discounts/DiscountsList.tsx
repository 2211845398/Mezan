import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { fromISO } from '@/lib/date';
import { notify } from '@/lib/toast';

import type { DiscountRuleRead } from '../../api';
import { updateDiscountRule } from '../../api';
import { crmKeys, discountsListQueryOptions } from '../../queries';
import DiscountForm from './DiscountForm';

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
  const { data: raw = [], isLoading, isError, refetch } = useQuery(
    discountsListQueryOptions({ limit: 100, offset: 0 }),
  );
  const rows = useMemo(() => sortDiscounts(raw), [raw]);

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
          cell: ({ row }) => t(`discounts.rule_status.${row.original.status}`),
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
        mode="client"
        columns={columns}
        data={rows}
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

import { useQuery } from '@tanstack/react-query';
import { paginatedParams } from '@/api/pagination';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

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

import type { DiscountRuleRead } from '../../api';
import { discountsListQueryOptions } from '../../queries';
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
  const canCreate = usePermission('discounts', 'create');
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
      ]),
    [t],
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
        getRowHref={(row) => `/crm/discounts/${row.id}/edit`}
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

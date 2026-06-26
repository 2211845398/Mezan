import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

import type { TransferRestockPrefill } from '../transfers/transferRestockPrefill';
import { useCommercialRestockAlertsQuery } from '../../queries';
import type { CommercialRestockAlertRow } from '../../types';

export default function CommercialRestockAlertsPage() {
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { data: rows = [], isLoading, isError, refetch } = useCommercialRestockAlertsQuery();

  const columns = useMemo(
    () =>
      defineColumns<CommercialRestockAlertRow>()([
        {
          id: 'branch',
          header: t('alerts.col.branch'),
          cell: ({ row }) => row.original.branch_name,
        },
        {
          id: 'product',
          accessorKey: 'product_name',
          header: t('alerts.col.product'),
        },
        {
          id: 'variant',
          header: t('alerts.col.variant'),
          cell: ({ row }) => row.original.variant_name?.trim() || row.original.variant_sku || '—',
        },
        {
          id: 'available',
          accessorKey: 'available',
          header: t('alerts.col.available'),
        },
        {
          id: 'reorder_point',
          accessorKey: 'reorder_point',
          header: t('alerts.col.reorder_point'),
        },
        {
          id: 'suggested_qty',
          accessorKey: 'suggested_qty',
          header: t('alerts.col.suggested_qty'),
        },
        {
          id: 'source',
          header: t('alerts.col.source_warehouse'),
          cell: ({ row }) =>
            row.original.suggested_from_branch_name?.trim() ||
            (row.original.can_prefill_transfer ? '—' : t('alerts.no_source')),
        },
        {
          id: 'status',
          header: t('alerts.col.status'),
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.severity}
              label={t(`stock.reorder_status.${row.original.severity}`, row.original.severity)}
            />
          ),
        },
      ]),
    [t],
  );

  function openTransferFromAlert(alert: CommercialRestockAlertRow) {
    if (!alert.can_prefill_transfer || alert.suggested_from_branch_id == null) {
      toast.error(t('alerts.no_warehouse_stock'));
      return;
    }
    if (!alert.uom_id) {
      toast.error(t('errors.generic'));
      return;
    }
    const prefill: TransferRestockPrefill = {
      from_branch_id: alert.suggested_from_branch_id,
      to_branch_id: alert.branch_id,
      lines: [
        {
          product_id: alert.product_id,
          variant_id: alert.variant_id,
          qty: alert.suggested_qty,
          uom_id: alert.uom_id,
          product_name: alert.product_name,
          variant_name: alert.variant_name || alert.product_name,
          reference_code: alert.reference_code,
          product_image_url: alert.product_image_url ?? null,
        },
      ],
    };
    navigate('/inventory/transfers/new', { state: { restockPrefill: prefill } });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">{tc('nav.dashboard')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/inventory/stock">{tc('nav.inventory')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t('alerts.title')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title={t('alerts.title')} subtitle={t('alerts.subtitle')} />

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyMessage={t('alerts.empty')}
        getRowClassName={() => 'cursor-pointer'}
        onRowClick={(row) => openTransferFromAlert(row)}
      />
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMe } from '@/features/auth/queries';
import { inclusiveCalendarDaySpan } from '@/lib/date';

import type { LeaveRequestRead } from '../../api';
import { formatVacationBalanceRemaining } from '../../lib/leaveBalanceDisplay';
import EmployeeLeaveRequestDialog from '../employees/EmployeeLeaveRequestDialog';
import { leaveBalanceQueryOptions, myLeaveListQueryOptions } from '../../queries';

export default function MyLeavesPage() {
  const { t } = useTranslation('hr');
  const { data: me } = useMe();
  const employeeProfileId = me?.employee_profile_id ?? 0;
  const [status, setStatus] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const st = status === 'all' ? undefined : status;

  const { data: balance } = useQuery({
    ...leaveBalanceQueryOptions(employeeProfileId, true),
    enabled: employeeProfileId > 0,
  });

  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    myLeaveListQueryOptions(st === undefined ? {} : { status: st }),
  );

  const columns = useMemo(
    () =>
      defineColumns<LeaveRequestRead>()([
        {
          id: 'type',
          accessorKey: 'leave_type',
          header: t('leave.col.type'),
          cell: ({ row }) => t(`leave.type.${row.original.leave_type}`, row.original.leave_type),
        },
        {
          id: 'start',
          accessorKey: 'start_date',
          header: t('leave.col.start'),
          cell: ({ row }) => (
            <span className="num-latin">{String(row.original.start_date).slice(0, 10)}</span>
          ),
        },
        {
          id: 'end',
          accessorKey: 'end_date',
          header: t('leave.col.end'),
          cell: ({ row }) => (
            <span className="num-latin">{String(row.original.end_date).slice(0, 10)}</span>
          ),
        },
        {
          id: 'days',
          header: t('leave.col.days'),
          cell: ({ row }) => (
            <span className="num-latin">
              {inclusiveCalendarDaySpan(row.original.start_date, row.original.end_date)}
            </span>
          ),
        },
        {
          id: 'status',
          accessorKey: 'status',
          header: t('leave.col.status'),
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.status}
              label={t(`leave.status.${row.original.status}`, row.original.status)}
            />
          ),
        },
        {
          id: 'reviewed',
          header: t('leave.col.reviewed_at'),
          cell: ({ row }) => (
            <span className="num-latin">
              {row.original.reviewed_at ? String(row.original.reviewed_at).slice(0, 10) : '—'}
            </span>
          ),
        },
      ]),
    [t],
  );

  if (!employeeProfileId) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <PageHeader title={t('leave.my_title')} />
        <p className="text-sm text-muted-foreground">{t('leave.no_employee_profile')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <PageHeader
        title={t('leave.my_title')}
        description={t('leave.my_subtitle')}
        actions={
          <Button type="button" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            {t('leave.dialog.trigger')}
          </Button>
        }
      />

      <SectionCard title={t('leave.balance_title')}>
        {balance?.remaining_days == null ? (
          <p className="text-sm text-muted-foreground">{t('leave.dialog.balance_not_tracked')}</p>
        ) : (
          <div className="space-y-1 text-sm">
            <p className="text-lg font-medium tabular-nums num-latin">
              {t('leave.dialog.balance_remaining')}:{' '}
              {formatVacationBalanceRemaining(balance.remaining_days)}
            </p>
            <p className="text-muted-foreground">
              {t('leave.dialog.balance_entitlement')}:{' '}
              {formatVacationBalanceRemaining(balance.entitlement_days)} ·{' '}
              {t('leave.dialog.balance_used')}:{' '}
              {formatVacationBalanceRemaining(balance.used_days)}
            </p>
          </div>
        )}
      </SectionCard>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('leave.filter.all')}</SelectItem>
            <SelectItem value="pending">{t('leave.status.pending')}</SelectItem>
            <SelectItem value="approved">{t('leave.status.approved')}</SelectItem>
            <SelectItem value="rejected">{t('leave.status.rejected')}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" asChild>
          <Link to="/profile">{t('leave.back_profile')}</Link>
        </Button>
      </div>

      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        searchPlaceholder={t('leave.search_placeholder')}
      />

      <EmployeeLeaveRequestDialog
        employeeProfileId={employeeProfileId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selfService
      />
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';

import type { LeaveRequestRead } from '../../api';
import { leaveListQueryOptions } from '../../queries';
import LeaveApproveDrawer from './LeaveApproveDrawer';

export default function LeaveList() {
  const { t } = useTranslation('hr');
  const canCreate = usePermission('employees', 'create');
  const canApprove = usePermission('employees', 'approve');
  const [status, setStatus] = useState<string>('pending');
  const st = status === 'all' ? undefined : status;
  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    leaveListQueryOptions(st === undefined ? {} : { status: st }),
  );
  const [sel, setSel] = useState<LeaveRequestRead | null>(null);
  const [open, setOpen] = useState(false);

  const columns = useMemo(
    () =>
      defineColumns<LeaveRequestRead>()([
        { id: 'id', accessorKey: 'id', header: t('leave.col.id') },
        { id: 'emp', header: t('leave.col.employee'), cell: ({ row }) => row.original.employee_profile_id },
        { id: 'type', accessorKey: 'leave_type', header: t('leave.col.type') },
        { id: 'status', accessorKey: 'status', header: t('leave.col.status') },
        {
          id: 'from',
          header: t('leave.col.from'),
          cell: ({ row }) => row.original.start_date,
        },
        { id: 'to', header: t('leave.col.to'), cell: ({ row }) => row.original.end_date },
        {
          id: 'act',
          header: '',
          cell: ({ row }) =>
            canApprove && row.original.status === 'pending' ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setSel(row.original);
                  setOpen(true);
                }}
              >
                {t('leave.review')}
              </Button>
            ) : null,
        },
      ]),
    [canApprove, t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('leave.title')}</h1>
        {canCreate ? (
          <Button asChild>
            <Link to="/hr/leave/new">{t('leave.new')}</Link>
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Label>{t('leave.filter_status')}</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">{t('leave.st.pending')}</SelectItem>
            <SelectItem value="approved">{t('leave.st.approved')}</SelectItem>
            <SelectItem value="rejected">{t('leave.st.rejected')}</SelectItem>
            <SelectItem value="all">{t('leave.st.all')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
      <LeaveApproveDrawer open={open} onOpenChange={setOpen} leave={sel} />
    </div>
  );
}

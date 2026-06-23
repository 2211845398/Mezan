import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import type { AttendanceDeviceRead } from '../../attendanceDevices/api';
import { useAttendanceDevices, useUpdateAttendanceDevice } from '../../attendanceDevices/queries';
import { AttendanceDeviceForm } from './AttendanceDeviceForm';

export default function AttendanceDevicesList() {
  const { t } = useTranslation('hr');
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: devices = [], isLoading, isError, refetch } = useAttendanceDevices();
  const canCreate = usePermission('attendance_devices', 'create');
  const canUpdate = usePermission('attendance_devices', 'update');
  const updateMutation = useUpdateAttendanceDevice();

  const [formOpen, setFormOpen] = useState(false);
  const [editDevice, setEditDevice] = useState<AttendanceDeviceRead | null>(null);

  const rawEdit = searchParams.get('edit');
  const editIdFromUrl =
    rawEdit && /^\d+$/.test(rawEdit) ? Number.parseInt(rawEdit, 10) : null;

  useEffect(() => {
    if (editIdFromUrl == null || editIdFromUrl <= 0) return;
    const device = devices.find((d) => d.id === editIdFromUrl);
    if (device) {
      setEditDevice(device);
      setFormOpen(true);
    }
  }, [editIdFromUrl, devices]);

  const columns = useMemo(
    () =>
      defineColumns<AttendanceDeviceRead>()([
        { id: 'device_code', accessorKey: 'device_code', header: t('attendanceDevices.col.code') },
        { id: 'name', accessorKey: 'name', header: t('attendanceDevices.col.name') },
        {
          id: 'branch',
          header: t('attendanceDevices.col.branch'),
          cell: ({ row }) => row.original.branch_name ?? row.original.branch_id,
        },
        {
          id: 'user',
          header: t('attendanceDevices.col.user'),
          cell: ({ row }) => row.original.user_email ?? '—',
        },
        {
          id: 'active',
          header: t('attendanceDevices.col.active'),
          cell: ({ row }) =>
            canUpdate ? (
              <Switch
                data-stop-row-click
                checked={row.original.is_active}
                onCheckedChange={(checked) => {
                  void updateMutation
                    .mutateAsync({ id: row.original.id, body: { is_active: checked } })
                    .then(() => notify.success(t('attendanceDevices.saved')))
                    .catch((error) => notifyApiError(error, t('attendanceDevices.saveFailed')));
                }}
              />
            ) : row.original.is_active ? (
              t('attendanceDevices.yes')
            ) : (
              t('attendanceDevices.no')
            ),
        },
      ]),
    [t, canUpdate, updateMutation],
  );

  function closeForm() {
    setFormOpen(false);
    setEditDevice(null);
    if (searchParams.has('edit')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('edit');
          return next;
        },
        { replace: true },
      );
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('attendanceDevices.title')}</h1>
        {canCreate ? (
          <Button
            onClick={() => {
              setEditDevice(null);
              setFormOpen(true);
            }}
          >
            {t('attendanceDevices.create')}
          </Button>
        ) : null}
      </div>

      <DataTable
        mode="client"
        showSearch={false}
        columns={columns}
        data={devices}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t('attendanceDevices.empty')}</p>}
        getRowHref={(row) => `/hr/attendance/devices?edit=${row.id}`}
      />

      <AttendanceDeviceForm
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
          else setFormOpen(true);
        }}
        device={editDevice}
      />
    </div>
  );
}

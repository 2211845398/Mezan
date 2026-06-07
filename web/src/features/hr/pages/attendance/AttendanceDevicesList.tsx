import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { data: devices = [], isLoading, isError, refetch } = useAttendanceDevices();
  const canCreate = usePermission('attendance_devices', 'create');
  const canUpdate = usePermission('attendance_devices', 'update');
  const updateMutation = useUpdateAttendanceDevice();

  const [formOpen, setFormOpen] = useState(false);
  const [editDevice, setEditDevice] = useState<AttendanceDeviceRead | null>(null);

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
        ...(canUpdate
          ? [
              {
                id: 'edit',
                header: '',
                cell: ({ row }: { row: { original: AttendanceDeviceRead } }) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditDevice(row.original);
                      setFormOpen(true);
                    }}
                  >
                    {t('attendanceDevices.edit')}
                  </Button>
                ),
              },
            ]
          : []),
      ]),
    [t, canUpdate, updateMutation],
  );

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
      />

      <AttendanceDeviceForm
        open={formOpen}
        onOpenChange={setFormOpen}
        device={editDevice}
      />
    </div>
  );
}

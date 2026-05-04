import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';

import type { WeeklyScheduleRead } from '../../api';
import { createSchedule, schedulesQueryOptions, updateSchedule } from '../../queries';

const WEEKDAYS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

export default function EmployeeSchedule() {
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const { t } = useTranslation('hr');
  const qc = useQueryClient();

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const { data: schedules = [], isLoading } = useQuery({
    ...schedulesQueryOptions(employeeId),
    enabled: !Number.isNaN(employeeId),
  });

  const defaultBranchId = branches[0]?.id ?? 1;

  // Form state for new schedule
  const [newWeekday, setNewWeekday] = useState(0);
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('17:00');
  const [newIsDayOff, setNewIsDayOff] = useState(false);
  const [newBranchId, setNewBranchId] = useState(defaultBranchId);

  const addSchedule = useMutation({
    mutationFn: () =>
      createSchedule(employeeId, {
        weekday: newWeekday,
        start_time: `${newStartTime}:00`,
        end_time: `${newEndTime}:00`,
        is_day_off: newIsDayOff,
        branch_id: newBranchId,
      }),
    onSuccess: () => {
      toast.success(t('schedule.added'));
      qc.invalidateQueries({ queryKey: ['hr', 'schedules', employeeId] });
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  const updateExisting = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateSchedule>[2] }) =>
      updateSchedule(employeeId, id, data),
    onSuccess: () => {
      toast.success(t('schedule.updated'));
      qc.invalidateQueries({ queryKey: ['hr', 'schedules', employeeId] });
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  const columns = useMemo(
    () =>
      defineColumns<WeeklyScheduleRead>()([
        {
          id: 'day',
          header: t('schedule.col.day'),
          cell: ({ row }) => WEEKDAYS.find(d => d.value === row.original.weekday)?.label || row.original.weekday,
        },
        {
          id: 'branch',
          header: t('schedule.col.branch'),
          cell: ({ row }) =>
            branches.find(b => b.id === row.original.branch_id)?.name || `Branch #${row.original.branch_id}`,
        },
        {
          id: 'status',
          header: t('schedule.col.status'),
          cell: ({ row }) =>
            row.original.is_day_off ? (
              <span className="text-muted-foreground">{t('employees.form.day_off')}</span>
            ) : (
              <span className="text-green-600">{t('employees.form.workday')}</span>
            ),
        },
        {
          id: 'hours',
          header: t('schedule.col.hours'),
          cell: ({ row }) =>
            row.original.is_day_off
              ? '—'
              : `${row.original.start_time.slice(0, 5)} - ${row.original.end_time.slice(0, 5)}`,
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <Switch
                checked={!row.original.is_day_off}
                onCheckedChange={(checked) =>
                  updateExisting.mutate({
                    id: row.original.id,
                    data: { is_day_off: !checked },
                  })
                }
              />
              <span className="text-sm text-muted-foreground">
                {row.original.is_day_off ? t('schedule.mark_workday') : t('schedule.mark_day_off')}
              </span>
            </div>
          ),
        },
      ]),
    [t, branches, updateExisting],
  );

  return (
    <div className="space-y-6">
      <SectionCard title={t('schedule.current')}>
        <DataTable
          mode="client"
          columns={columns}
          data={schedules}
          isLoading={isLoading}
          emptyState={<p className="text-sm text-muted-foreground">{t('schedule.empty')}</p>}
        />
      </SectionCard>

      <SectionCard title={t('schedule.add_new')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label>{t('schedule.col.day')}</Label>
            <Select value={String(newWeekday)} onValueChange={(v) => setNewWeekday(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d.value} value={String(d.value)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{t('schedule.col.branch')}</Label>
            <Select value={String(newBranchId)} onValueChange={(v) => setNewBranchId(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{t('schedule.start_time')}</Label>
            <Input
              type="time"
              value={newStartTime}
              onChange={(e) => setNewStartTime(e.target.value)}
              disabled={newIsDayOff}
            />
          </div>

          <div className="space-y-1">
            <Label>{t('schedule.end_time')}</Label>
            <Input
              type="time"
              value={newEndTime}
              onChange={(e) => setNewEndTime(e.target.value)}
              disabled={newIsDayOff}
            />
          </div>

          <div className="flex items-end gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="dayOff"
                checked={newIsDayOff}
                onCheckedChange={setNewIsDayOff}
              />
              <Label htmlFor="dayOff">{t('employees.form.day_off')}</Label>
            </div>
            <Button
              type="button"
              onClick={() => addSchedule.mutate()}
              disabled={addSchedule.isPending}
            >
              {t('schedule.add')}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

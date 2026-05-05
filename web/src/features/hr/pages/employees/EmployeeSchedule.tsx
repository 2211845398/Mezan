import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';

import { deleteSchedule, type WeeklyScheduleRead } from '../../api';
import { scheduleWeekdayLabel, weeklyScheduleRowSearchValue } from '../../lib/hrTableSearch';
import { createSchedule, hrKeys, schedulesQueryOptions, updateSchedule } from '../../queries';

const WEEKDAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const;

const formLabelClass = 'not-italic font-medium leading-none';

/** WebKit time inputs often render AM/PM oblique; normalize to upright text. */
const timeFieldClassName =
  'num-latin not-italic font-normal [&::-webkit-datetime-edit]:not-italic [&::-webkit-datetime-edit-fields-wrapper]:not-italic [&::-webkit-datetime-edit-hour-field]:not-italic [&::-webkit-datetime-edit-minute-field]:not-italic [&::-webkit-datetime-edit-ampm-field]:not-italic';

export default function EmployeeSchedule() {
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const { t, i18n } = useTranslation('hr');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const canUpdate = usePermission('employees', 'update');

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const { data: schedules = [], isLoading } = useQuery({
    ...schedulesQueryOptions(employeeId),
    enabled: !Number.isNaN(employeeId),
  });

  const [newWeekday, setNewWeekday] = useState(0);
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('17:00');
  const [newIsDayOff, setNewIsDayOff] = useState(false);
  const [newBranchId, setNewBranchId] = useState<number | null>(null);

  const [editing, setEditing] = useState<WeeklyScheduleRead | null>(null);
  const [editWeekday, setEditWeekday] = useState(0);
  const [editBranchId, setEditBranchId] = useState(0);
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('17:00');
  const [editIsDayOff, setEditIsDayOff] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<WeeklyScheduleRead | null>(null);

  useEffect(() => {
    if (newBranchId == null && branches[0]?.id != null) {
      setNewBranchId(branches[0].id);
    }
  }, [branches, newBranchId]);

  useEffect(() => {
    if (!editing) return;
    setEditWeekday(editing.weekday);
    setEditBranchId(editing.branch_id);
    setEditStartTime(editing.start_time.slice(0, 5));
    setEditEndTime(editing.end_time.slice(0, 5));
    setEditIsDayOff(editing.is_day_off);
  }, [editing]);

  const branchPick = newBranchId ?? branches[0]?.id ?? 1;

  const invalidateSchedules = () => {
    void qc.invalidateQueries({ queryKey: hrKeys.schedules(employeeId) });
  };

  const addSchedule = useMutation({
    mutationFn: () =>
      createSchedule(employeeId, {
        weekday: newWeekday,
        start_time: `${newStartTime}:00`,
        end_time: `${newEndTime}:00`,
        is_day_off: newIsDayOff,
        branch_id: branchPick,
      }),
    onSuccess: () => {
      toast.success(t('schedule.added'));
      invalidateSchedules();
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  const updateExisting = useMutation({
    mutationFn: ({ id: rowId, data }: { id: number; data: Parameters<typeof updateSchedule>[2] }) =>
      updateSchedule(employeeId, rowId, data),
    onSuccess: () => {
      invalidateSchedules();
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  const saveEdit = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('No row');
      return updateSchedule(employeeId, editing.id, {
        weekday: editWeekday,
        branch_id: editBranchId,
        start_time: `${editStartTime}:00`,
        end_time: `${editEndTime}:00`,
        is_day_off: editIsDayOff,
      });
    },
    onSuccess: () => {
      toast.success(t('schedule.updated'));
      setEditing(null);
      invalidateSchedules();
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  const removeRow = useMutation({
    mutationFn: (scheduleId: number) => deleteSchedule(employeeId, scheduleId),
    onSuccess: () => {
      toast.success(t('schedule.deleted'));
      setDeleteTarget(null);
      invalidateSchedules();
    },
    onError: (error) => notifyApiError(error, t('hr_errors.generic')),
  });

  const columns = useMemo(() => {
    const tAr = i18n.getFixedT('ar', 'hr');
    const tEn = i18n.getFixedT('en', 'hr');
    const workAr = tAr('employees.form.workday');
    const workEn = tEn('employees.form.workday');
    const offAr = tAr('employees.form.day_off');
    const offEn = tEn('employees.form.day_off');
    const hoursStr = (row: WeeklyScheduleRead) =>
      row.is_day_off ? '' : `${row.start_time.slice(0, 5)} ${row.end_time.slice(0, 5)}`;
    const searchOpts = (row: WeeklyScheduleRead, wk: string) => ({
      weekdayLabel: wk,
      branchName: branches.find((x) => x.id === row.branch_id)?.name ?? '',
      statusWork: t('employees.form.workday'),
      statusOff: t('employees.form.day_off'),
      hours: hoursStr(row),
    });
    return defineColumns<WeeklyScheduleRead>()([
      {
        id: 'day',
        header: t('schedule.col.day'),
        accessorFn: (row) => {
          const wk = scheduleWeekdayLabel(row.weekday, tAr);
          const wkEn = scheduleWeekdayLabel(row.weekday, tEn);
          const b = branches.find((x) => x.id === row.branch_id)?.name ?? '';
          return weeklyScheduleRowSearchValue(row, {
            weekdayLabel: [wk, wkEn].join(' '),
            branchName: b,
            statusWork: [workAr, workEn].join(' '),
            statusOff: [offAr, offEn].join(' '),
            hours: hoursStr(row),
          });
        },
        cell: ({ row }) => scheduleWeekdayLabel(row.original.weekday, t),
      },
      {
        id: 'branch',
        header: t('schedule.col.branch'),
        accessorFn: (row) => {
          const wk = scheduleWeekdayLabel(row.weekday, t);
          return weeklyScheduleRowSearchValue(row, {
            ...searchOpts(row, wk),
            weekdayLabel: wk,
          });
        },
        cell: ({ row }) =>
          branches.find((b) => b.id === row.original.branch_id)?.name || `Branch #${row.original.branch_id}`,
      },
      {
        id: 'start_time',
        header: t('schedule.start_time'),
        accessorFn: (row) => {
          const wk = scheduleWeekdayLabel(row.weekday, t);
          return weeklyScheduleRowSearchValue(row, { ...searchOpts(row, wk), weekdayLabel: wk });
        },
        cell: ({ row }) => {
          const r = row.original;
          if (r.is_day_off) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          const serverVal = r.start_time.slice(0, 5);
          return (
            <Input
              type="time"
              defaultValue={serverVal}
              key={`st-${r.id}-${r.start_time}-${r.updated_at}`}
              disabled={!canUpdate}
              className={cn(timeFieldClassName, 'h-9 w-full min-w-[6.5rem] max-w-[9rem]')}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                if (!v || v === serverVal) return;
                const prev = serverVal;
                updateExisting.mutate(
                  { id: r.id, data: { start_time: `${v}:00` } },
                  {
                    onError: () => {
                      e.currentTarget.value = prev;
                    },
                  },
                );
              }}
            />
          );
        },
      },
      {
        id: 'end_time',
        header: t('schedule.end_time'),
        accessorFn: (row) => {
          const wk = scheduleWeekdayLabel(row.weekday, t);
          return weeklyScheduleRowSearchValue(row, { ...searchOpts(row, wk), weekdayLabel: wk });
        },
        cell: ({ row }) => {
          const r = row.original;
          if (r.is_day_off) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          const serverVal = r.end_time.slice(0, 5);
          return (
            <Input
              type="time"
              defaultValue={serverVal}
              key={`et-${r.id}-${r.end_time}-${r.updated_at}`}
              disabled={!canUpdate}
              className={cn(timeFieldClassName, 'h-9 w-full min-w-[6.5rem] max-w-[9rem]')}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                if (!v || v === serverVal) return;
                const prev = serverVal;
                updateExisting.mutate(
                  { id: r.id, data: { end_time: `${v}:00` } },
                  {
                    onError: () => {
                      e.currentTarget.value = prev;
                    },
                  },
                );
              }}
            />
          );
        },
      },
      {
        id: 'status',
        size: 220,
        header: t('schedule.col.status'),
        accessorFn: (row) => {
          const wk = scheduleWeekdayLabel(row.weekday, t);
          return weeklyScheduleRowSearchValue(row, { ...searchOpts(row, wk), weekdayLabel: wk });
        },
        cell: ({ row }) => (
          <div className="flex w-fit max-w-full items-center gap-2">
            {row.original.is_day_off ? (
              <span className="text-muted-foreground">{t('employees.form.day_off')}</span>
            ) : (
              <span className="text-green-600">{t('employees.form.workday')}</span>
            )}
            <Switch
              checked={row.original.is_day_off}
              disabled={!canUpdate}
              onCheckedChange={(checked) =>
                updateExisting.mutate({
                  id: row.original.id,
                  data: { is_day_off: checked },
                })
              }
              aria-label={t('schedule.toggle_holiday')}
            />
          </div>
        ),
      },
      {
        id: 'actions',
        size: 88,
        header: '',
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9"
              disabled={!canUpdate}
              aria-label={t('schedule.edit')}
              onClick={() => setEditing(row.original)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn('size-9 text-destructive hover:text-destructive')}
              disabled={!canUpdate}
              aria-label={t('schedule.delete')}
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ]);
  }, [branches, canUpdate, i18n, t, updateExisting]);

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
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-4 lg:gap-y-3">
          <div className="grid min-w-0 flex-1 gap-1.5 lg:min-w-[9rem] lg:max-w-[14rem]">
            <Label className={formLabelClass}>{t('schedule.col.day')}</Label>
            <Select value={String(newWeekday)} onValueChange={(v) => setNewWeekday(Number(v))} disabled={!canUpdate}>
              <SelectTrigger className="w-full not-italic font-normal text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_VALUES.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {scheduleWeekdayLabel(d, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid min-w-0 flex-1 gap-1.5 lg:min-w-[9rem] lg:max-w-[14rem]">
            <Label className={formLabelClass}>{t('schedule.col.branch')}</Label>
            <Select value={String(branchPick)} onValueChange={(v) => setNewBranchId(Number(v))} disabled={!canUpdate}>
              <SelectTrigger className="w-full not-italic font-normal text-foreground">
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

          <div className="grid min-w-0 flex-1 gap-1.5 lg:min-w-[8.5rem] lg:max-w-[11rem]">
            <Label className={formLabelClass}>{t('schedule.start_time')}</Label>
            <Input
              type="time"
              value={newStartTime}
              onChange={(e) => setNewStartTime(e.target.value)}
              disabled={newIsDayOff || !canUpdate}
              className={timeFieldClassName}
            />
          </div>

          <div className="grid min-w-0 flex-1 gap-1.5 lg:min-w-[8.5rem] lg:max-w-[11rem]">
            <Label className={formLabelClass}>{t('schedule.end_time')}</Label>
            <Input
              type="time"
              value={newEndTime}
              onChange={(e) => setNewEndTime(e.target.value)}
              disabled={newIsDayOff || !canUpdate}
              className={timeFieldClassName}
            />
          </div>

          <div className="grid min-w-0 flex-1 gap-1.5 lg:min-w-[10rem] lg:max-w-[14rem]">
            <Label htmlFor="new-day-off" className={formLabelClass}>
              {t('schedule.holiday')}
            </Label>
            <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
              <Switch id="new-day-off" checked={newIsDayOff} onCheckedChange={setNewIsDayOff} disabled={!canUpdate} />
            </div>
          </div>

          <div className="flex shrink-0 lg:ms-auto">
            <Button
              type="button"
              className="h-10 w-full min-[480px]:w-auto lg:min-w-[7rem]"
              onClick={() => addSchedule.mutate()}
              disabled={!canUpdate || addSchedule.isPending}
            >
              {t('schedule.add')}
            </Button>
          </div>
        </div>
      </SectionCard>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('schedule.edit_title')}</DialogTitle>
            <DialogDescription>{scheduleWeekdayLabel(editWeekday, t)}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className={formLabelClass}>{t('schedule.col.day')}</Label>
              <Select value={String(editWeekday)} onValueChange={(v) => setEditWeekday(Number(v))}>
                <SelectTrigger className="w-full not-italic font-normal text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_VALUES.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {scheduleWeekdayLabel(d, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className={formLabelClass}>{t('schedule.col.branch')}</Label>
              <Select value={String(editBranchId)} onValueChange={(v) => setEditBranchId(Number(v))}>
                <SelectTrigger className="w-full not-italic font-normal text-foreground">
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
            <div className="grid gap-2">
              <Label className={formLabelClass}>{t('schedule.start_time')}</Label>
              <Input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                disabled={editIsDayOff}
                className={timeFieldClassName}
              />
            </div>
            <div className="grid gap-2">
              <Label className={formLabelClass}>{t('schedule.end_time')}</Label>
              <Input
                type="time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                disabled={editIsDayOff}
                className={timeFieldClassName}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-day-off" className={formLabelClass}>
                {t('schedule.holiday')}
              </Label>
              <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
                <Switch id="edit-day-off" checked={editIsDayOff} onCheckedChange={setEditIsDayOff} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="button" disabled={saveEdit.isPending} onClick={() => saveEdit.mutate()}>
              {tc('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('schedule.delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('schedule.delete_confirm_body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeRow.isPending}
              onClick={() => {
                if (deleteTarget) removeRow.mutate(deleteTarget.id);
              }}
            >
              {t('schedule.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

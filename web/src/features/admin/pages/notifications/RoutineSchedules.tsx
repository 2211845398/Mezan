import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  floatingFormApproveButtonClassName,
  floatingFormApproveButtonSmClassName,
  floatingFormCloseButtonClassName,
  floatingFormCloseButtonSmClassName,
  floatingFormDangerButtonSmClassName,
  FloatingFormDialog,
} from '@/components/shared/FloatingFormDialog';
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
import { useOrgNotificationManager } from '@/hooks/useOrgNotificationManager';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { notify } from '@/lib/toast';

import { triggerNotificationSchedule } from '../../api';
import { BranchPicker } from '../../components/BranchPicker';
import { DangerConfirmDialog } from '../../components/DangerConfirmDialog';
import { RoleCodeCombobox } from '../../components/RoleCodeCombobox';
import {
  adminKeys,
  useDeleteSchedule,
  useNotificationSchedules,
  useToggleScheduleActive,
  useUpsertSchedule,
} from '../../queries';
import type { NotificationScheduleRead } from '../../types';
import { frequencyLabel, frequencyOptions, kindLabel, routineKindOptions } from './notificationOptions';

type EditingState = NotificationScheduleRead | 'new' | null;

export default function RoutineSchedules() {
  const { t } = useTranslation('admin');
  const canUpdate = usePermission('notifications', 'update');
  const { data: rows = [], isLoading, refetch } = useNotificationSchedules();
  const [editing, setEditing] = useState<EditingState>(null);
  const toggle = useToggleScheduleActive();
  const removeSchedule = useDeleteSchedule();
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<NotificationScheduleRead | null>(null);
  const runOnce = useMutation({
    mutationFn: triggerNotificationSchedule,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.notificationRuns() });
      await qc.invalidateQueries({ queryKey: adminKeys.notificationDeliveries() });
      notify.success(t('notifications.run_started'));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('notifications.routine_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('notifications.routine_lead')}</p>
        </div>
        {canUpdate ? (
          <Button type="button" onClick={() => setEditing('new')}>
            {t('notifications.new_routine')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('notifications.no_routines')}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{row.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{kindLabel(t, row.kind)}</p>
                </div>
                {canUpdate ? (
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={() => {
                      void (async () => {
                        try {
                          await toggle.mutateAsync(row);
                          notify.success(t('notifications.toggle_saved'));
                        } catch {
                          /* toast from API layer */
                        }
                      })();
                    }}
                    aria-label={t('notifications.toggle_routine')}
                  />
                ) : null}
              </div>
              <div className="mt-4 grid gap-2 text-sm">
                <p>
                  <span className="text-muted-foreground">{t('notifications.frequency_label')}: </span>
                  {frequencyLabel(t, row.interval_minutes)}
                </p>
                <p>
                  <span className="text-muted-foreground">{t('notifications.audience')}: </span>
                  {row.target_role_code ?? t('notifications.audience_all')}
                </p>
                <p>
                  <span className="text-muted-foreground">{t('notifications.next_run')}: </span>
                  {row.next_run_at ? formatIso(row.next_run_at, 'yyyy-MM-dd HH:mm') : t('notifications.pending')}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {canUpdate ? (
                  <Button
                    type="button"
                    size="sm"
                    className={floatingFormCloseButtonSmClassName}
                    onClick={() => setEditing(row)}
                  >
                    {t('actions.edit')}
                  </Button>
                ) : null}
                {canUpdate ? (
                  <Button
                    type="button"
                    size="sm"
                    className={floatingFormApproveButtonSmClassName}
                    disabled={runOnce.isPending || !row.is_active}
                    onClick={() => {
                      void (async () => {
                        try {
                          await runOnce.mutateAsync(row.id);
                        } catch {
                          /* toast from API layer */
                        }
                      })();
                    }}
                  >
                    {t('notifications.run_once')}
                  </Button>
                ) : null}
                {canUpdate ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className={floatingFormDangerButtonSmClassName}
                    disabled={removeSchedule.isPending}
                    onClick={() => setPendingDelete(row)}
                  >
                    {t('notifications.delete_routine')}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <DangerConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t('notifications.delete_routine_title')}
        description={t('notifications.delete_routine_desc')}
        confirmKeyword={(pendingDelete?.name ?? '').trim() || 'DELETE'}
        isLoading={removeSchedule.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          void (async () => {
            try {
              await removeSchedule.mutateAsync(pendingDelete.id);
              notify.success(t('notifications.routine_deleted'));
              setPendingDelete(null);
            } catch {
              /* envelope */
            }
          })();
        }}
      />

      <RoutineDialog
        row={editing === 'new' ? null : editing}
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            void refetch();
          }
        }}
      />
    </div>
  );
}

function RoutineDialog({
  row,
  open,
  onOpenChange,
}: {
  row: NotificationScheduleRead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('admin');
  const canOrgNotificationAdmin = useOrgNotificationManager();
  const upsert = useUpsertSchedule();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('manual_broadcast');
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(String(24 * 60));
  const [targetType, setTargetType] = useState<'all' | 'role'>('all');
  const [roleCode, setRoleCode] = useState('');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (row) {
      setName(row.name);
      setKind(row.kind);
      setMessageTitle(String(row.parameters?.title ?? ''));
      setMessageBody(String(row.parameters?.body ?? ''));
      setIntervalMinutes(String(row.interval_minutes));
      setTargetType(row.target_role_code ? 'role' : 'all');
      setRoleCode(row.target_role_code ?? '');
      setBranchId(row.branch_id);
      setIsActive(row.is_active);
    } else {
      setName('');
      setKind('manual_broadcast');
      setMessageTitle('');
      setMessageBody('');
      setIntervalMinutes(String(24 * 60));
      setTargetType(canOrgNotificationAdmin ? 'all' : 'role');
      setRoleCode('');
      setBranchId(null);
      setIsActive(true);
    }
  }, [row, open, canOrgNotificationAdmin]);

  const disabled =
    upsert.isPending ||
    name.trim().length === 0 ||
    kind.length === 0 ||
    (kind === 'manual_broadcast' &&
      (messageTitle.trim().length === 0 || messageBody.trim().length === 0)) ||
    Number(intervalMinutes) < 1 ||
    (targetType === 'role' && roleCode.length === 0);

  async function handleSave() {
    try {
      await upsert.mutateAsync({
        name: name.trim(),
        kind,
        interval_minutes: Number(intervalMinutes),
        target_role_code: targetType === 'role' ? roleCode : null,
        branch_id: branchId,
        parameters:
          kind === 'manual_broadcast'
            ? { title: messageTitle.trim(), body: messageBody.trim() }
            : (row?.parameters ?? {}),
        is_active: isActive,
      });
      notify.success(t('notifications.schedule_saved'));
      onOpenChange(false);
    } catch {
      /* validation / network: envelope interceptor may toast */
    }
  }

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={row ? t('notifications.edit_routine') : t('notifications.create_routine')}
      maxWidth="lg"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className={floatingFormCloseButtonClassName}
            disabled={upsert.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            className={floatingFormApproveButtonClassName}
            disabled={disabled}
            onClick={() => void handleSave()}
          >
            {t('actions.save')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>{t('notifications.routine_name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>{t('notifications.routine_type')}</Label>
            <Select value={kind} onValueChange={setKind} disabled={!!row}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {routineKindOptions.map((option) => (
                  <SelectItem key={option.kind} value={option.kind}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{t('notifications.frequency_label')}</Label>
            <Select value={intervalMinutes} onValueChange={setIntervalMinutes}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((option) => (
                  <SelectItem key={option.minutes} value={String(option.minutes)}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {kind === 'manual_broadcast' ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t('notifications.message_title')}</Label>
              <Input value={messageTitle} onChange={(e) => setMessageTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t('notifications.message_body')}</Label>
              <Input value={messageBody} onChange={(e) => setMessageBody(e.target.value)} />
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>{t('notifications.audience')}</Label>
            <Select value={targetType} onValueChange={(value) => setTargetType(value as 'all' | 'role')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {canOrgNotificationAdmin ? (
                  <SelectItem value="all">{t('notifications.audience_all')}</SelectItem>
                ) : null}
                <SelectItem value="role">{t('notifications.audience_role')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <BranchPicker
            label={t('notifications.branch_filter')}
            value={branchId}
            onChange={setBranchId}
            allowClear
          />
        </div>

        {targetType === 'role' ? (
          <div className="grid gap-2">
            <Label>{t('notifications.target_role')}</Label>
            <RoleCodeCombobox value={roleCode} onChange={setRoleCode} />
          </div>
        ) : null}

        <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <span>{t('notifications.active_routine')}</span>
        </label>
      </div>
    </FloatingFormDialog>
  );
}

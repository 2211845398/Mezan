import type { TFunction } from 'i18next';

export const routineKindOptions = [
  { kind: 'manual_broadcast', labelKey: 'notifications.kind.manual_broadcast' },
  { kind: 'low_stock', labelKey: 'notifications.kind.low_stock' },
  { kind: 'expiring_inventory', labelKey: 'notifications.kind.expiring_inventory' },
  { kind: 'payroll_approval_pending', labelKey: 'notifications.kind.payroll_approval_pending' },
  { kind: 'shift_close_reminder', labelKey: 'notifications.kind.shift_close_reminder' },
  { kind: 'backup_failure', labelKey: 'notifications.kind.backup_failure' },
] as const;

export const frequencyOptions = [
  { minutes: 60, labelKey: 'notifications.frequency.hourly' },
  { minutes: 6 * 60, labelKey: 'notifications.frequency.every_6_hours' },
  { minutes: 24 * 60, labelKey: 'notifications.frequency.daily' },
  { minutes: 7 * 24 * 60, labelKey: 'notifications.frequency.weekly' },
] as const;

export function kindLabel(t: TFunction, kind: string): string {
  const option = routineKindOptions.find((item) => item.kind === kind);
  return option ? t(option.labelKey) : kind;
}

export function frequencyLabel(t: TFunction, minutes: number): string {
  const option = frequencyOptions.find((item) => item.minutes === minutes);
  return option ? t(option.labelKey) : t('notifications.frequency.custom_minutes', { count: minutes });
}

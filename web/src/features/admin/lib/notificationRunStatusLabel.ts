import type { TFunction } from 'i18next';

/** Maps API `NotificationRunRead.status` values to `admin.json` → `notifications.run_status.*`. */
export function formatNotificationRunStatus(t: TFunction<'admin'>, status: string): string {
  const k = String(status).toLowerCase();
  return t(`notifications.run_status.${k}`, { defaultValue: status });
}

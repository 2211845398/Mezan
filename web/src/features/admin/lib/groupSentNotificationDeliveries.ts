import type { TFunction } from 'i18next';

import type { NotificationDeliveryRead } from '../types';

/** Stable key: one broadcast / one logical message → one row in admin history. */
export function sentNotificationBatchKey(row: NotificationDeliveryRead): string {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const broadcasted =
    typeof data.broadcasted_at === 'string' && data.broadcasted_at.length > 0
      ? data.broadcasted_at
      : '';
  const created = row.created_at.slice(0, 19);
  return `${row.template_kind}\0${row.title}\0${row.body}\0${broadcasted || created}`;
}

/** One logical send (may include many per-user delivery rows). */
export type GroupedSentNotification = {
  /** One row used for title/body/data (audience) — identical within the batch for broadcasts. */
  representative: NotificationDeliveryRead;
  statusCounts: Record<string, number>;
  /** Earliest created_at in the batch (ISO). */
  createdAt: string;
};

export function groupSentNotificationDeliveries(
  deliveries: NotificationDeliveryRead[],
): GroupedSentNotification[] {
  const map = new Map<string, NotificationDeliveryRead[]>();
  for (const row of deliveries) {
    const k = sentNotificationBatchKey(row);
    const g = map.get(k) ?? [];
    g.push(row);
    map.set(k, g);
  }

  const out: GroupedSentNotification[] = [];
  for (const group of map.values()) {
    if (!group.length) continue;
    const first = group[0]!;
    const statusCounts: Record<string, number> = {};
    for (const r of group) {
      const s = String(r.status).toLowerCase();
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
    const createdAt = group.reduce((min, r) => (r.created_at < min ? r.created_at : min), first.created_at);
    const representative = group.reduce((best, r) => (r.id > best.id ? r : best), first);
    out.push({
      representative,
      statusCounts,
      createdAt,
    });
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

const STATUS_ORDER = ['sent', 'pending', 'failed', 'skipped'] as const;

export function formatGroupedDeliveryStatus(
  counts: Record<string, number>,
  t: TFunction<'admin'>,
): string {
  const ordered = new Set<string>([...STATUS_ORDER]);
  const parts: string[] = [];
  for (const key of STATUS_ORDER) {
    const n = counts[key] ?? 0;
    if (n > 0) parts.push(`${n} ${t(`notifications.delivery_status.${key}`)}`);
  }
  for (const [k, n] of Object.entries(counts)) {
    if (ordered.has(k)) continue;
    if (n > 0) parts.push(`${n} ${k}`);
  }
  return parts.length > 0 ? parts.join(t('notifications.status_aggregate_sep')) : '—';
}

import type { TFunction } from 'i18next';

const EM_DASH = '—';

/** Localized movement kind label from `movement_kind` / transaction_type. */
export function formatMovementKind(
  kind: string | null | undefined,
  t: TFunction<'inventory'>,
): string {
  if (!kind?.trim()) return EM_DASH;
  const key = kind.trim();
  const label = t(`adjustments.txn.${key}`, { defaultValue: '' });
  if (label) return label;
  const alt = t(`adjustments.kind.${key}`, { defaultValue: '' });
  return alt || EM_DASH;
}

/** Localized reason: system keys via i18n; free-text shown as entered. */
export function formatMovementReason(
  reason: string | null | undefined,
  t: TFunction<'inventory'>,
): string {
  const raw = reason?.trim();
  if (!raw) return EM_DASH;
  const translated = t(`adjustments.reason.${raw}`, { defaultValue: '' });
  return translated || raw;
}

/** Transfer route: arrow points left in Arabic, right in English. */
export function formatTransferRoute(from: string, to: string, language: string): string {
  const arrow = language.startsWith('ar') ? '←' : '→';
  return `${from} ${arrow} ${to}`;
}

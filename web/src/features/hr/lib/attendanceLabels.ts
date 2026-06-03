import type { TFunction } from 'i18next';

export function attendanceCategoryLabel(
  t: TFunction<'hr'>,
  code: string | null | undefined,
): string {
  if (!code) return '—';
  return t(`attendance.category.${code}`, { defaultValue: code });
}

export function attendanceStatusLabel(
  t: TFunction<'hr'>,
  code: string | null | undefined,
): string {
  if (!code) return '—';
  return t(`attendance.status.${code}`, { defaultValue: code });
}

/** Bilingual search blob for category + status codes. */
export function attendanceLabelsSearchBlob(
  tHr: TFunction<'hr'>,
  tHrAr: TFunction<'hr'>,
  tHrEn: TFunction<'hr'>,
  category: string | null | undefined,
  status: string | null | undefined,
): string {
  const parts: string[] = [];
  if (category) {
    parts.push(category, attendanceCategoryLabel(tHr, category));
    parts.push(attendanceCategoryLabel(tHrAr, category), attendanceCategoryLabel(tHrEn, category));
  }
  if (status) {
    parts.push(status, attendanceStatusLabel(tHr, status));
    parts.push(attendanceStatusLabel(tHrAr, status), attendanceStatusLabel(tHrEn, status));
  }
  return parts.join(' ');
}

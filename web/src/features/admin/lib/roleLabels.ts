import type { TFunction } from 'i18next';

/**
 * Localized label for a system role **code** only. Values sent to the API stay English.
 * Arabic (and English) display titles are canonical in `i18n` under `admin.roles.codes.*`.
 * Do not use for person names or branch names.
 */
export function roleCodeLabel(
  t: TFunction<'admin'>,
  code: string | null | undefined,
  fallback?: string | null,
): string {
  const c = (code ?? '').trim();
  if (!c) return '';
  return t(`roles.codes.${c}`, { defaultValue: fallback ?? c });
}

import { env } from '@/config/env';

/**
 * BCP-47 locale used only for grouping/decimal symbols — digits are always
 * Western (0-9) via `numberingSystem: 'latn'` in `@/lib/format`.
 *
 * Do not use bare `ar` (browser-dependent digits). Defaults to `ar-EG`.
 */
export type NumericLocale = 'ar-EG' | 'ar-SA' | 'en-US';

export function getNumericLocale(): NumericLocale {
  return env.VITE_LOCALE_NUMBERS;
}

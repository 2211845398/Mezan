/** Recharts category axes: show right-most category first in RTL layouts. */
export function mirrorCategoriesForRtl<T>(rows: readonly T[], rtl: boolean): T[] {
  return rtl ? [...rows].reverse() : [...rows];
}

/** Count Cartesian combinations for variant axes (product of non-empty axis sizes). */
export function cartesianVariantCount(axes: { valueIds: number[] }[]): number {
  const active = axes.filter((a) => a.valueIds.length > 0);
  if (active.length === 0) {
    return 1;
  }
  return active.reduce((n, a) => n * a.valueIds.length, 1);
}

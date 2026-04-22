import type { BranchRead } from '../types';

export function getBranchLabel(branches: BranchRead[] | undefined, branchId: number | null) {
  if (branchId == null) return '—';
  const b = branches?.find((x) => x.id === branchId);
  return b ? `${b.code} — ${b.name}` : String(branchId);
}

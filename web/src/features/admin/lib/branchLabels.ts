import type { BranchRead } from '../types';

export function getBranchLabel(branches: BranchRead[] | undefined, branchId: number | null) {
  if (branchId == null) return '—';
  const b = branches?.find((x) => x.id === branchId);
  return b ? `${b.code} — ${b.name}` : String(branchId);
}

// Display name only; prefers API branch_name when the branches list is unavailable.
export function getBranchDisplayName(
  branches: BranchRead[] | undefined,
  branchId: number | null,
  branchName?: string | null,
) {
  if (branchName?.trim()) return branchName.trim();
  if (branchId == null) return '—';
  const b = branches?.find((x) => x.id === branchId);
  if (b?.name?.trim()) return b.name.trim();
  return '—';
}

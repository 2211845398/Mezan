import type { TFunction } from 'i18next';

import type { BranchRead, UserRead } from '../types';
import { getBranchLabel } from './branchLabels';
import { roleCodeLabel } from './roleLabels';

/** Values used by TanStack global filter; includes ar/en status labels and raw code. */
export function userRowStatusFilterValue(
  row: UserRead,
  tAr: TFunction<'admin'>,
  tEn: TFunction<'admin'>,
): string {
  const s = row.status;
  const ar = tAr(`users.user_status.${s}`, { defaultValue: s });
  const en = tEn(`users.user_status.${s}`, { defaultValue: s });
  return [s, ar, en].filter(Boolean).join(' ');
}

/** Raw role codes plus ar/en role labels for global filter. */
export function userRowRoleFilterValue(
  userId: number,
  roleMap: Map<number, string> | undefined,
  tAr: TFunction<'admin'>,
  tEn: TFunction<'admin'>,
): string {
  const raw = roleMap?.get(userId);
  if (!raw || raw === '—' || raw === '…') return '';
  const codes = raw
    .split(', ')
    .map((c) => c.trim())
    .filter(Boolean);
  const parts: string[] = [...codes];
  for (const code of codes) {
    parts.push(roleCodeLabel(tAr, code, code));
    parts.push(roleCodeLabel(tEn, code, code));
  }
  return parts.filter(Boolean).join(' ');
}

/** Branch id, code, name, and display label (matches table cell). */
export function userRowBranchFilterValue(row: UserRead, branches: BranchRead[] | undefined): string {
  const bid = row.branch_id ?? null;
  if (bid == null) return '';
  const b = branches?.find((x) => x.id === bid);
  const label = getBranchLabel(branches, bid);
  return [String(bid), b?.code ?? '', b?.name ?? '', label].filter(Boolean).join(' ');
}

import type { ChartAccountRead } from '../api';

import { resolveCoaDisplayName } from './coaDisplayName';

/** System liability accounts that are not vendor trade AP. */
const EXCLUDED_AP_CODES = new Set(['2100', '2110', '2150', '2200']);

export function filterPayableSupplierAccounts(accounts: ChartAccountRead[]): ChartAccountRead[] {
  return accounts.filter(
    (a) =>
      a.account_type === 'liability' &&
      a.active &&
      !a.is_control &&
      !EXCLUDED_AP_CODES.has(a.code),
  );
}

/** RTL-friendly label: Arabic shows name · code (right-to-left); English shows code - name. */
export function formatPayableAccountOptionLabel(account: ChartAccountRead, locale: string): string {
  const name = resolveCoaDisplayName(account, locale);
  if (locale.toLowerCase().startsWith('ar')) {
    return `${name} · ${account.code}`;
  }
  return `${account.code} - ${name}`;
}

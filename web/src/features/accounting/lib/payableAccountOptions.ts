import type { ChartAccountRead } from '../api';

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

import type { TFunction } from 'i18next';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

export function accountTypeLabel(t: TFunction<'accounting'>, accountType: string): string {
  const normalized = accountType.trim().toLowerCase();
  if ((ACCOUNT_TYPES as readonly string[]).includes(normalized)) {
    return t(`coa.account_type.${normalized}`);
  }
  return accountType;
}

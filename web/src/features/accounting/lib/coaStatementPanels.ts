import type { AccountType, ChartAccountRead, ChartAccountTreeNode } from '../api';

export type CoaStatementPanel = 'balance_sheet' | 'income_statement';

export const BALANCE_SHEET_ROOT_TYPES: readonly AccountType[] = [
  'asset',
  'liability',
  'equity',
] as const;

export const INCOME_STATEMENT_ROOT_TYPES: readonly AccountType[] = ['revenue', 'expense'] as const;

export function rootTypesForPanel(panel: CoaStatementPanel): readonly AccountType[] {
  return panel === 'balance_sheet' ? BALANCE_SHEET_ROOT_TYPES : INCOME_STATEMENT_ROOT_TYPES;
}

export function filterForestByPanel(
  forest: ChartAccountTreeNode[],
  panel: CoaStatementPanel,
): ChartAccountTreeNode[] {
  const allowed = new Set<string>(rootTypesForPanel(panel));
  return forest.filter((node) => allowed.has(node.account_type));
}

export function accountMatchesPanel(
  accountType: AccountType,
  panel: CoaStatementPanel,
): boolean {
  return rootTypesForPanel(panel).includes(accountType);
}

export function indexAccountsById(
  accounts: ChartAccountRead[],
): Map<number, ChartAccountRead> {
  return new Map(accounts.map((a) => [a.id, a]));
}

export function resolveRootAccountType(
  accountId: number,
  byId: Map<number, ChartAccountRead>,
): AccountType | null {
  let current = byId.get(accountId);
  const visited = new Set<number>();
  while (current) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    if (current.parent_id == null) return current.account_type as AccountType;
    current = byId.get(current.parent_id);
  }
  return null;
}

export function filterGroupParentOptions(
  accounts: ChartAccountRead[],
  panel: CoaStatementPanel,
): ChartAccountRead[] {
  const byId = indexAccountsById(accounts);
  return accounts.filter((a) => {
    if (a.is_leaf && !a.is_control) return false;
    const rootType =
      a.parent_id == null
        ? (a.account_type as AccountType)
        : resolveRootAccountType(a.id, byId);
    if (rootType == null) return false;
    return accountMatchesPanel(rootType, panel);
  });
}

export function inferAccountTypeForParent(
  parentId: number | null,
  accounts: ChartAccountRead[],
): AccountType | null {
  if (parentId == null) return null;
  const byId = indexAccountsById(accounts);
  return resolveRootAccountType(parentId, byId);
}

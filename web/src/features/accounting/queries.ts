import { queryOptions } from '@tanstack/react-query';

import * as api from './api';

export const accountingKeys = {
  root: ['accounting'] as const,
  journals: (q: {
    date_from: string;
    date_to: string;
    branch_id?: number;
    source_type?: string;
    page: number;
    pageSize: number;
  }) => [...accountingKeys.root, 'journals', q] as const,
  journal: (id: number) => [...accountingKeys.root, 'journal', id] as const,
  chartAccounts: () => [...accountingKeys.root, 'chart-accounts'] as const,
  trialBalance: (p: { as_of: string; branch_id?: number }) =>
    [...accountingKeys.root, 'tb', p] as const,
  incomeStatement: (p: { period_start: string; period_end: string; branch_id?: number }) =>
    [...accountingKeys.root, 'is', p] as const,
  balanceSheet: (p: { as_of: string; branch_id?: number }) =>
    [...accountingKeys.root, 'bs', p] as const,
  gl: (p: {
    account_id: number;
    date_from: string;
    date_to: string;
    branch_id?: number;
  }) => [...accountingKeys.root, 'gl', p] as const,
  arOpen: (p: { branch_id?: number; status?: string }) =>
    [...accountingKeys.root, 'ar', p] as const,
  apOpen: (p: { branch_id?: number; status?: string }) =>
    [...accountingKeys.root, 'ap', p] as const,
  fiscal: () => [...accountingKeys.root, 'fiscal'] as const,
};

export function journalListQueryOptions(args: {
  date_from: string;
  date_to: string;
  branch_id?: number;
  source_type?: string;
  page: number;
  pageSize: number;
}) {
  const { page, pageSize, ...rest } = args;
  return queryOptions({
    queryKey: accountingKeys.journals({ ...args }),
    queryFn: () =>
      api.listJournalEntries({
        ...rest,
        limit: pageSize,
        offset: page * pageSize,
      }),
  });
}

export function journalDetailQueryOptions(id: number) {
  return queryOptions({
    queryKey: accountingKeys.journal(id),
    queryFn: () => api.getJournalEntry(id),
    enabled: !Number.isNaN(id),
  });
}

export function chartAccountsQueryOptions() {
  return queryOptions({
    queryKey: accountingKeys.chartAccounts(),
    queryFn: () => api.listChartAccounts(false),
  });
}

export function trialBalanceQueryOptions(p: { as_of: string; branch_id?: number }) {
  return queryOptions({
    queryKey: accountingKeys.trialBalance(p),
    queryFn: () => api.getTrialBalance(p),
  });
}

export function incomeStatementQueryOptions(p: {
  period_start: string;
  period_end: string;
  branch_id?: number;
}) {
  return queryOptions({
    queryKey: accountingKeys.incomeStatement(p),
    queryFn: () => api.getIncomeStatement(p),
  });
}

export function balanceSheetQueryOptions(p: { as_of: string; branch_id?: number }) {
  return queryOptions({
    queryKey: accountingKeys.balanceSheet(p),
    queryFn: () => api.getBalanceSheet(p),
  });
}

export function generalLedgerQueryOptions(p: {
  account_id: number;
  date_from: string;
  date_to: string;
  branch_id?: number;
}) {
  return queryOptions({
    queryKey: accountingKeys.gl(p),
    queryFn: () => api.getGeneralLedger(p),
    enabled: !Number.isNaN(p.account_id) && p.account_id > 0,
  });
}

export function arOpenItemsQueryOptions(p: { branch_id?: number; status?: string }) {
  return queryOptions({
    queryKey: accountingKeys.arOpen(p),
    queryFn: () => api.listArOpenItems(p),
  });
}

export function apOpenItemsQueryOptions(p: { branch_id?: number; status?: string }) {
  return queryOptions({
    queryKey: accountingKeys.apOpen(p),
    queryFn: () => api.listApOpenItems(p),
  });
}

export function fiscalPeriodsQueryOptions() {
  return queryOptions({
    queryKey: accountingKeys.fiscal(),
    queryFn: () => api.listFiscalPeriods(),
  });
}

import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

export type JournalEntryListResponse = components['schemas']['JournalEntryListResponse'];
export type JournalEntryListItemRead = components['schemas']['JournalEntryListItemRead'];
export type JournalEntryLineRead = components['schemas']['JournalEntryLineRead'] & {
  subledger_entity_name?: string | null;
};

export type JournalEntryDetailRead = Omit<
  components['schemas']['JournalEntryDetailRead'],
  'lines'
> & {
  lines: JournalEntryLineRead[];
  source_reference?: string | null;
};

export type SubledgerKind = 'none' | 'customer' | 'supplier' | 'employee';

export type ChartAccountRead = components['schemas']['app__schemas__chart_accounts__ChartAccountRead'] & {
  is_leaf?: boolean;
  subledger_kind?: SubledgerKind;
  depth?: number;
  name_ar?: string | null;
  name_en?: string | null;
};
export type TrialBalanceRow = components['schemas']['TrialBalanceRow'];
export type IncomeStatementRead = components['schemas']['IncomeStatementRead'];
export type BalanceSheetRead = components['schemas']['BalanceSheetRead'];
export type GeneralLedgerLineRead = components['schemas']['GeneralLedgerLineRead'];
export type OpenItemRead = components['schemas']['OpenItemRead'];
export type FiscalPeriodRead = components['schemas']['FiscalPeriodRead'];
export type FiscalPeriodDetailRead = {
  id: number;
  period_key: string;
  period_start: string;
  period_end: string;
  status: 'open' | 'soft_closed' | 'closed';
  closed_at?: string | null;
  closed_by_user_id?: number | null;
  closed_by_name?: string | null;
  can_post: boolean;
  posting_reason: string;
  trial_balance: TrialBalanceRow[];
  subledger_activity: Array<{
    account_id: number;
    code: string;
    name: string;
    subledger_kind: string;
    line_count: number;
    total_debit: string | number;
    total_credit: string | number;
    net: string | number;
  }>;
  ar_open_items_count: number;
  ar_open_amount: string | number;
  ap_open_items_count: number;
  ap_open_amount: string | number;
};
export type FiscalPeriodStatusUpdate = components['schemas']['FiscalPeriodStatusUpdate'];
export type JournalReversalRequest = components['schemas']['JournalReversalRequest'];
export type JournalReversalResponse = components['schemas']['JournalReversalResponse'];
export type ManualJournalCreate = Omit<
  components['schemas']['ManualJournalCreate'],
  'lines'
> & {
  lines: Array<
    components['schemas']['ManualJournalLineIn'] & {
      customer_id?: number | null;
      supplier_id?: number | null;
      employee_id?: number | null;
    }
  >;
};

export type ManualJournalUpdate = {
  entry_date: string;
  description: string;
  lines: ManualJournalCreate['lines'];
};
export type PaymentApplicationCreate = components['schemas']['PaymentApplicationCreate'];
export type PaymentApplicationRead = components['schemas']['PaymentApplicationRead'];

export type AccountingPostResult = {
  status?: string;
  message?: string;
  journal_entry_id?: number | null;
  idempotency_key?: string | null;
  total_amount?: string | null;
};

export type ChartAccountTreeNode = ChartAccountRead & {
  children?: ChartAccountTreeNode[];
  branch_total_debit?: string | number;
  branch_total_credit?: string | number;
  branch_net?: string | number;
  branch_subtree_net?: string | number;
};

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type ChartAccountCreateBody = {
  code: string;
  name: string;
  name_ar?: string | null;
  name_en?: string | null;
  account_type: AccountType;
  parent_id: number | null;
  is_control: boolean;
  subledger_kind?: SubledgerKind;
  active?: boolean;
  branch_id?: number | null;
  pos_terminal_id?: number | null;
};

export type ChartAccountUpdateBody = {
  code?: string;
  name?: string;
  name_ar?: string | null;
  name_en?: string | null;
  account_type?: AccountType;
  parent_id?: number | null;
  is_control?: boolean;
  subledger_kind?: SubledgerKind;
  active?: boolean;
  branch_id?: number | null;
  pos_terminal_id?: number | null;
};

export type ChartAccountDeleteCheck = {
  can_delete: boolean;
  reason: string;
};

export type ChartAccountSuggestCodeRead = {
  suggested_code: string | null;
};

export type PostableChartAccountRead = {
  id: number;
  code: string;
  name: string;
  name_ar?: string | null;
  name_en?: string | null;
  account_type: string;
  parent_id: number | null;
  parent_code: string | null;
  parent_name: string | null;
  subledger_kind: SubledgerKind;
  is_leaf: boolean;
  active: boolean;
};

export async function listPostableChartAccounts(): Promise<PostableChartAccountRead[]> {
  const { data } = await apiClient.get<PostableChartAccountRead[]>(
    '/accounting/chart-accounts/postable',
  );
  return data;
}

export async function listJournalEntries(params: {
  date_from: string;
  date_to: string;
  branch_id?: number;
  source_type?: string;
  limit?: number;
  offset?: number;
}): Promise<JournalEntryListResponse> {
  const { data } = await apiClient.get<JournalEntryListResponse>('/accounting/journal-entries', {
    params,
  });
  return data;
}

export async function getJournalEntry(id: number): Promise<JournalEntryDetailRead> {
  const { data } = await apiClient.get<JournalEntryDetailRead>(`/accounting/journal-entries/${id}`);
  return data;
}

export async function updateJournalEntry(
  id: number,
  body: ManualJournalUpdate,
): Promise<JournalEntryDetailRead> {
  const { data } = await apiClient.patch<JournalEntryDetailRead>(
    `/accounting/journal-entries/${id}`,
    body,
  );
  return data;
}

export async function listChartAccounts(includeInactive = false): Promise<ChartAccountRead[]> {
  const { data } = await apiClient.get<ChartAccountRead[]>('/accounting/chart-accounts', {
    params: { active_only: !includeInactive },
  });
  return data;
}

export async function listChartAccountsTree(activeOnly = true): Promise<ChartAccountTreeNode[]> {
  const { data } = await apiClient.get<ChartAccountTreeNode[]>('/accounting/chart-accounts/tree', {
    params: { active_only: activeOnly },
  });
  return data;
}

export async function listChartAccountsTreeByBranch(params: {
  branch_id: number;
  as_of?: string;
  active_only?: boolean;
}): Promise<ChartAccountTreeNode[]> {
  const { data } = await apiClient.get<ChartAccountTreeNode[]>(
    `/accounting/chart-accounts/by-branch/${params.branch_id}`,
    {
      params: {
        as_of: params.as_of,
        active_only: params.active_only ?? true,
      },
    },
  );
  return data;
}

export async function getChartAccount(id: number): Promise<ChartAccountRead> {
  const { data } = await apiClient.get<ChartAccountRead>(`/accounting/chart-accounts/${id}`);
  return data;
}

export async function createChartAccount(body: ChartAccountCreateBody): Promise<ChartAccountRead> {
  const { data } = await apiClient.post<ChartAccountRead>('/accounting/chart-accounts', body);
  return data;
}

export async function updateChartAccount(
  id: number,
  body: ChartAccountUpdateBody,
): Promise<ChartAccountRead> {
  const { data } = await apiClient.patch<ChartAccountRead>(`/accounting/chart-accounts/${id}`, body);
  return data;
}

export async function deleteChartAccount(id: number): Promise<void> {
  await apiClient.delete(`/accounting/chart-accounts/${id}`);
}

export async function checkChartAccountDeletable(id: number): Promise<ChartAccountDeleteCheck> {
  const { data } = await apiClient.get<ChartAccountDeleteCheck>(
    `/accounting/chart-accounts/${id}/can-delete`,
  );
  return data;
}

export async function suggestChartAccountCode(
  parentId: number | null,
): Promise<ChartAccountSuggestCodeRead> {
  const { data } = await apiClient.get<ChartAccountSuggestCodeRead>(
    '/accounting/chart-accounts/suggest-code',
    { params: { parent_id: parentId ?? undefined } },
  );
  return data;
}

export async function getTrialBalance(params: {
  as_of: string;
  branch_id?: number;
}): Promise<TrialBalanceRow[]> {
  const { data } = await apiClient.get<TrialBalanceRow[]>('/accounting/trial-balance', { params });
  return data;
}

export async function exportTrialBalanceCsvBlob(params: {
  as_of: string;
  branch_id?: number;
}): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/accounting/trial-balance/export', {
    params,
    responseType: 'blob',
  });
  return data;
}

export async function exportTrialBalancePdfBlob(params: {
  as_of: string;
  branch_id?: number;
}): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/accounting/trial-balance/export.pdf', {
    params,
    responseType: 'blob',
  });
  return data;
}

export async function getIncomeStatement(params: {
  period_start: string;
  period_end: string;
  branch_id?: number;
}): Promise<IncomeStatementRead> {
  const { data } = await apiClient.get<IncomeStatementRead>('/accounting/income-statement', {
    params,
  });
  return data;
}

export async function getBalanceSheet(params: {
  as_of: string;
  branch_id?: number;
}): Promise<BalanceSheetRead> {
  const { data } = await apiClient.get<BalanceSheetRead>('/accounting/balance-sheet', { params });
  return data;
}

export async function getGeneralLedger(params: {
  account_id: number;
  date_from: string;
  date_to: string;
  branch_id?: number;
  customer_id?: number;
  supplier_id?: number;
  employee_id?: number;
}): Promise<GeneralLedgerLineRead[]> {
  const { data } = await apiClient.get<GeneralLedgerLineRead[]>('/accounting/general-ledger', {
    params,
  });
  return data;
}

export async function listArOpenItems(params?: {
  branch_id?: number;
  status?: string;
  source_type?: string;
  source_id?: string;
}): Promise<OpenItemRead[]> {
  const { data } = await apiClient.get<OpenItemRead[]>('/accounting/ar/open-items', { params });
  return data;
}

export type ApSupplierBalanceRead = components['schemas']['ApSupplierBalanceRead'];

export async function listApOpenItems(params?: {
  branch_id?: number;
  status?: string;
  supplier_id?: number;
}): Promise<OpenItemRead[]> {
  const { data } = await apiClient.get<OpenItemRead[]>('/accounting/ap/open-items', { params });
  return data;
}

export async function listApSupplierBalances(params?: {
  branch_id?: number;
}): Promise<ApSupplierBalanceRead[]> {
  const { data } = await apiClient.get<ApSupplierBalanceRead[]>(
    '/accounting/ap/supplier-balances',
    { params },
  );
  return data;
}

export async function applyArPayment(
  openItemId: number,
  body: PaymentApplicationCreate,
  idempotencyKey: string,
): Promise<PaymentApplicationRead> {
  const { data } = await apiClient.post<PaymentApplicationRead>(
    `/accounting/ar/open-items/${openItemId}/applications`,
    body,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data;
}

export async function applyApPayment(
  openItemId: number,
  body: PaymentApplicationCreate,
  idempotencyKey: string,
): Promise<PaymentApplicationRead> {
  const { data } = await apiClient.post<PaymentApplicationRead>(
    `/accounting/ap/open-items/${openItemId}/applications`,
    body,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data;
}

export async function listFiscalPeriods(): Promise<FiscalPeriodRead[]> {
  const { data } = await apiClient.get<FiscalPeriodRead[]>('/accounting/fiscal-periods');
  return data;
}

export async function getFiscalPeriodDetail(
  periodKey: string,
  branchId?: number | null,
): Promise<FiscalPeriodDetailRead> {
  const { data } = await apiClient.get<FiscalPeriodDetailRead>(
    `/accounting/fiscal-periods/${encodeURIComponent(periodKey)}`,
    { params: branchId != null ? { branch_id: branchId } : undefined },
  );
  return data;
}

export async function updateFiscalPeriod(periodKey: string, body: FiscalPeriodStatusUpdate): Promise<FiscalPeriodRead> {
  const { data } = await apiClient.put<FiscalPeriodRead>(`/accounting/fiscal-periods/${periodKey}`, body);
  return data;
}

export async function reverseJournalEntry(
  journalEntryId: number,
  body: JournalReversalRequest,
): Promise<JournalReversalResponse> {
  const { data } = await apiClient.post<JournalReversalResponse>(
    `/accounting/journal-entries/${journalEntryId}/reverse`,
    body,
  );
  return data;
}

export async function createManualJournal(
  body: ManualJournalCreate,
  idempotencyKey: string,
): Promise<JournalEntryDetailRead> {
  const { data } = await apiClient.post<JournalEntryDetailRead>('/accounting/journal-entries', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export async function postReceiptVoucher(
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<AccountingPostResult> {
  const { data } = await apiClient.post<AccountingPostResult>('/accounting/vouchers/receipt', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export async function postPaymentVoucher(
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<AccountingPostResult> {
  const { data } = await apiClient.post<AccountingPostResult>('/accounting/vouchers/payment', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export async function postOpeningBalance(
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<AccountingPostResult> {
  const { data } = await apiClient.post<AccountingPostResult>('/accounting/opening-balance', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export type CurrencyRead = {
  id: number;
  code: string;
  name: string;
  decimal_places: number;
  suffix: string | null;
  exchange_rate_to_base: string | null;
  active: boolean;
  is_base: boolean;
  cash_rounding_increment?: string | null;
};

export type AccountingSettingsRead = {
  base_currency_id: number;
  base_currency_code: string;
  base_currency_name: string;
};

export type PaymentTermRead = {
  id: number;
  code: string;
  name_en: string;
  name_ar: string;
  days: number;
  active: boolean;
  created_at: string;
};

export async function listCurrencies(includeInactive = false): Promise<CurrencyRead[]> {
  const { data } = await apiClient.get<CurrencyRead[]>('/accounting/currencies', {
    params: { include_inactive: includeInactive },
  });
  return data;
}

export async function createCurrency(body: {
  code: string;
  name: string;
  decimal_places?: number;
  suffix?: string | null;
  exchange_rate_to_base?: string | null;
}): Promise<CurrencyRead> {
  const { data } = await apiClient.post<CurrencyRead>('/accounting/currencies', body);
  return data;
}

export async function updateCurrency(
  currencyId: number,
  body: {
    name?: string;
    decimal_places?: number;
    suffix?: string | null;
    active?: boolean;
    cash_rounding_increment?: string | null;
  },
): Promise<CurrencyRead> {
  const { data } = await apiClient.patch<CurrencyRead>(`/accounting/currencies/${currencyId}`, body);
  return data;
}

export async function updateCurrencyRate(
  currencyId: number,
  exchange_rate_to_base: string,
): Promise<CurrencyRead> {
  const { data } = await apiClient.patch<CurrencyRead>(`/accounting/currencies/${currencyId}/rate`, {
    exchange_rate_to_base,
  });
  return data;
}

export async function getAccountingSettings(): Promise<AccountingSettingsRead> {
  const { data } = await apiClient.get<AccountingSettingsRead>('/accounting/settings');
  return data;
}

export async function updateAccountingSettings(body: {
  base_currency_id: number;
}): Promise<AccountingSettingsRead> {
  const { data } = await apiClient.patch<AccountingSettingsRead>('/accounting/settings', body);
  return data;
}

export async function listPaymentTerms(activeOnly = true): Promise<PaymentTermRead[]> {
  const { data } = await apiClient.get<PaymentTermRead[]>('/accounting/payment-terms', {
    params: { active_only: activeOnly },
  });
  return data;
}

export async function createPaymentTerm(body: {
  code: string;
  name_en: string;
  name_ar: string;
  days: number;
  active?: boolean;
}): Promise<PaymentTermRead> {
  const { data } = await apiClient.post<PaymentTermRead>('/accounting/payment-terms', body);
  return data;
}

export async function updatePaymentTerm(
  termId: number,
  body: Partial<{ name_en: string; name_ar: string; days: number; active: boolean }>,
): Promise<PaymentTermRead> {
  const { data } = await apiClient.patch<PaymentTermRead>(`/accounting/payment-terms/${termId}`, body);
  return data;
}

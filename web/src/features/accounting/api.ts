import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

export type JournalEntryListResponse = components['schemas']['JournalEntryListResponse'];
export type JournalEntryListItemRead = components['schemas']['JournalEntryListItemRead'];
export type JournalEntryDetailRead = components['schemas']['JournalEntryDetailRead'];
export type ChartAccountRead = components['schemas']['ChartAccountRead'];
export type TrialBalanceRow = components['schemas']['TrialBalanceRow'];
export type IncomeStatementRead = components['schemas']['IncomeStatementRead'];
export type BalanceSheetRead = components['schemas']['BalanceSheetRead'];
export type GeneralLedgerLineRead = components['schemas']['GeneralLedgerLineRead'];
export type OpenItemRead = components['schemas']['OpenItemRead'];
export type FiscalPeriodRead = components['schemas']['FiscalPeriodRead'];
export type FiscalPeriodStatusUpdate = components['schemas']['FiscalPeriodStatusUpdate'];
export type JournalReversalRequest = components['schemas']['JournalReversalRequest'];
export type JournalReversalResponse = components['schemas']['JournalReversalResponse'];
export type ManualJournalCreate = components['schemas']['ManualJournalCreate'];
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
};

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

export async function listChartAccounts(includeInactive = false): Promise<ChartAccountRead[]> {
  const { data } = await apiClient.get<ChartAccountRead[]>('/accounting/chart-accounts', {
    params: { include_inactive: includeInactive },
  });
  return data;
}

export async function listChartAccountsTree(): Promise<ChartAccountTreeNode[]> {
  const { data } = await apiClient.get<ChartAccountTreeNode[]>('/accounting/chart-accounts/tree');
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
}): Promise<GeneralLedgerLineRead[]> {
  const { data } = await apiClient.get<GeneralLedgerLineRead[]>('/accounting/general-ledger', {
    params,
  });
  return data;
}

export async function listArOpenItems(params?: { branch_id?: number; status?: string }): Promise<OpenItemRead[]> {
  const { data } = await apiClient.get<OpenItemRead[]>('/accounting/ar/open-items', { params });
  return data;
}

export async function listApOpenItems(params?: { branch_id?: number; status?: string }): Promise<OpenItemRead[]> {
  const { data } = await apiClient.get<OpenItemRead[]>('/accounting/ap/open-items', { params });
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

export async function previewFxRevaluation(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<Record<string, unknown>>('/accounting/fx-revaluation/preview', body);
  return data;
}

export async function runFxRevaluation(
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<Record<string, unknown>>('/accounting/fx-revaluation/run', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export async function listBoms(): Promise<Array<Record<string, unknown>>> {
  const { data } = await apiClient.get<Array<Record<string, unknown>>>('/production/boms');
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

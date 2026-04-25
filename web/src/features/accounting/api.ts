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

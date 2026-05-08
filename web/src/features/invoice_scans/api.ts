import { apiClient } from '@/api/client';
import type { components, paths } from '@/api/generated/schema';

export type InvoiceScanRead = paths['/api/v1/invoice-scans']['get']['responses']['200']['content']['application/json'][number];
export type InvoiceScanOverride = components['schemas']['InvoiceScanOverride'];
export type ValidateBody = paths['/api/v1/invoice-scans/{scan_id}/validate']['post']['requestBody']['content']['application/json'];
export type ValidateResponse =
  paths['/api/v1/invoice-scans/{scan_id}/validate']['post']['responses']['200']['content']['application/json'];
export type InvoiceScanCreate = paths['/api/v1/invoice-scans']['post']['requestBody']['content']['application/json'];
export type InvoiceScanApplyCatalogMatchesRequest =
  components['schemas']['InvoiceScanApplyCatalogMatchesRequest'];
export type InvoiceMatchResponse =
  paths['/api/v1/ai/advisory/invoice-match']['post']['responses']['200']['content']['application/json'];

export async function listInvoiceScans(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<InvoiceScanRead[]> {
  const { data } = await apiClient.get<InvoiceScanRead[]>('/invoice-scans', { params });
  return data;
}

export async function getInvoiceScan(id: number): Promise<InvoiceScanRead> {
  const { data } = await apiClient.get<InvoiceScanRead>(`/invoice-scans/${id}`);
  return data;
}

export async function postInvoiceScan(body: InvoiceScanCreate): Promise<InvoiceScanRead> {
  const { data } = await apiClient.post<InvoiceScanRead>('/invoice-scans', body);
  return data;
}

export async function patchInvoiceScanOverride(
  id: number,
  body: InvoiceScanOverride,
): Promise<InvoiceScanRead> {
  const { data } = await apiClient.patch<InvoiceScanRead>(`/invoice-scans/${id}/override`, body);
  return data;
}

export async function postValidateInvoiceScan(id: number, body: ValidateBody): Promise<ValidateResponse> {
  const { data } = await apiClient.post<ValidateResponse>(`/invoice-scans/${id}/validate`, body);
  return data;
}

export async function postInvoiceMatch(body: {
  invoice_scan_id: number;
  max_candidates_per_line?: number;
}): Promise<InvoiceMatchResponse> {
  const { data } = await apiClient.post<InvoiceMatchResponse>('/ai/advisory/invoice-match', body);
  return data;
}

export async function applyCatalogMatches(
  scanId: number,
  body: InvoiceScanApplyCatalogMatchesRequest,
): Promise<InvoiceScanRead> {
  const { data } = await apiClient.post<InvoiceScanRead>(
    `/invoice-scans/${scanId}/apply-catalog-matches`,
    body,
    { headers: { 'Idempotency-Key': body.idempotency_key } },
  );
  return data;
}

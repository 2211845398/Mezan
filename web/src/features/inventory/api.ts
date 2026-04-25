import { apiClient } from '@/api/client';
import type { components, paths } from '@/api/generated/schema';

export type StockOnHandRow =
  paths['/api/v1/inventory/stock-on-hand']['get']['responses']['200']['content']['application/json'][number];
type StockMovement = paths['/api/v1/inventory/movements']['get']['responses']['200']['content']['application/json'][number];
type StockAdjustmentBody = paths['/api/v1/inventory/adjustments']['post']['requestBody']['content']['application/json'];
type TransferRead = paths['/api/v1/transfers']['get']['responses']['200']['content']['application/json'][number];
type TransferCreate = paths['/api/v1/transfers']['post']['requestBody']['content']['application/json'];
type InvoiceScanRead = paths['/api/v1/invoice-scans']['get']['responses']['200']['content']['application/json'][number];
type InvoiceScanOverride = components['schemas']['InvoiceScanOverride'];
type ValidateBody = paths['/api/v1/invoice-scans/{scan_id}/validate']['post']['requestBody']['content']['application/json'];
type ValidateResponse =
  paths['/api/v1/invoice-scans/{scan_id}/validate']['post']['responses']['200']['content']['application/json'];
type InvoiceScanCreate = paths['/api/v1/invoice-scans']['post']['requestBody']['content']['application/json'];

export type { InvoiceScanRead, StockMovement, TransferRead, ValidateResponse };

export async function listStockOnHand(params: {
  branch_id?: number;
  category_id?: number;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<StockOnHandRow[]> {
  const { data } = await apiClient.get<StockOnHandRow[]>('/inventory/stock-on-hand', { params });
  return data;
}

export async function listStockMovements(params: {
  branch_id?: number;
  product_id?: number;
  limit?: number;
  offset?: number;
}): Promise<StockMovement[]> {
  const { data } = await apiClient.get<StockMovement[]>('/inventory/movements', { params });
  return data;
}

export async function postStockAdjustment(
  body: StockAdjustmentBody,
): Promise<paths['/api/v1/inventory/adjustments']['post']['responses']['200']['content']['application/json']> {
  const { data } = await apiClient.post('/inventory/adjustments', body);
  return data;
}

export async function listTransferBatches(params?: { limit?: number; offset?: number }): Promise<TransferRead[]> {
  const { data } = await apiClient.get<TransferRead[]>('/transfers', { params });
  return data;
}

export async function getTransferBatch(id: number): Promise<TransferRead> {
  const { data } = await apiClient.get<TransferRead>(`/transfers/${id}`);
  return data;
}

export async function createTransferBatch(body: TransferCreate): Promise<TransferRead> {
  const { data } = await apiClient.post<TransferRead>('/transfers', body);
  return data;
}

export async function postDispatchTransfer(id: number): Promise<TransferRead> {
  const { data } = await apiClient.post<TransferRead>(`/transfers/${id}/dispatch`);
  return data;
}

export async function postReceiveTransfer(id: number): Promise<TransferRead> {
  const { data } = await apiClient.post<TransferRead>(`/transfers/${id}/receive`);
  return data;
}

export async function listInvoiceScans(params?: { status?: string; limit?: number; offset?: number }): Promise<
  InvoiceScanRead[]
> {
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

export async function patchInvoiceScanOverride(id: number, body: InvoiceScanOverride): Promise<InvoiceScanRead> {
  const { data } = await apiClient.patch<InvoiceScanRead>(`/invoice-scans/${id}/override`, body);
  return data;
}

export async function postValidateInvoiceScan(id: number, body: ValidateBody): Promise<ValidateResponse> {
  const { data } = await apiClient.post<ValidateResponse>(`/invoice-scans/${id}/validate`, body);
  return data;
}

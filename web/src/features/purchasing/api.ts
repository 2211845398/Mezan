import { apiClient } from '@/api/client';
import type { components, paths } from '@/api/generated/schema';

export type PurchaseOrderRead = components['schemas']['PurchaseOrderRead'];
export type PurchaseOrderCreate = components['schemas']['PurchaseOrderCreate'];
export type PurchaseOrderUpdate = components['schemas']['PurchaseOrderUpdate'];
export type PurchaseOrderLineCreate = components['schemas']['PurchaseOrderLineCreate'];
export type PurchaseOrderSendRequest = components['schemas']['PurchaseOrderSendRequest'];
export type SupplierRead = components['schemas']['SupplierRead'];
export type SupplierCreate = components['schemas']['SupplierCreate'];
export type SupplierUpdate = components['schemas']['SupplierUpdate'];
export type GoodsReceiptRead = components['schemas']['GoodsReceiptRead'];
export type GoodsReceiptReceiveRequest = components['schemas']['GoodsReceiptReceiveRequest'];
export type InvoiceScanRead = paths['/api/v1/invoice-scans']['get']['responses']['200']['content']['application/json'][number];
export type InvoiceScanApplyCatalogMatchesRequest =
  components['schemas']['InvoiceScanApplyCatalogMatchesRequest'];
export type InvoiceMatchResponse =
  paths['/api/v1/ai/advisory/invoice-match']['post']['responses']['200']['content']['application/json'];

export async function listPurchaseOrders(params?: {
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<PurchaseOrderRead[]> {
  const { data } = await apiClient.get<PurchaseOrderRead[]>('/purchase-orders', { params });
  return data;
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrderRead> {
  const { data } = await apiClient.get<PurchaseOrderRead>(`/purchase-orders/${id}`);
  return data;
}

export async function createPurchaseOrder(body: PurchaseOrderCreate): Promise<PurchaseOrderRead> {
  const { data } = await apiClient.post<PurchaseOrderRead>('/purchase-orders', body);
  return data;
}

export async function updatePurchaseOrder(id: number, body: PurchaseOrderUpdate): Promise<PurchaseOrderRead> {
  const { data } = await apiClient.patch<PurchaseOrderRead>(`/purchase-orders/${id}`, body);
  return data;
}

export async function sendPurchaseOrder(
  id: number,
  body: PurchaseOrderSendRequest,
  idempotencyKey?: string,
): Promise<PurchaseOrderRead> {
  const { data } = await apiClient.post<PurchaseOrderRead>(`/purchase-orders/${id}/send`, body, {
    ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
  });
  return data;
}

export async function trackPurchaseOrder(id: number): Promise<PurchaseOrderRead> {
  const { data } = await apiClient.post<PurchaseOrderRead>(`/purchase-orders/${id}/track`);
  return data;
}

export async function cancelPurchaseOrder(id: number): Promise<PurchaseOrderRead> {
  const { data } = await apiClient.post<PurchaseOrderRead>(`/purchase-orders/${id}/cancel`);
  return data;
}

export async function closePurchaseOrder(id: number): Promise<PurchaseOrderRead> {
  const { data } = await apiClient.post<PurchaseOrderRead>(`/purchase-orders/${id}/close`);
  return data;
}

export async function listSuppliers(): Promise<SupplierRead[]> {
  const { data } = await apiClient.get<SupplierRead[]>('/suppliers');
  return data;
}

export async function getSupplier(id: number): Promise<SupplierRead> {
  const { data } = await apiClient.get<SupplierRead>(`/suppliers/${id}`);
  return data;
}

export async function createSupplier(body: SupplierCreate): Promise<SupplierRead> {
  const { data } = await apiClient.post<SupplierRead>('/suppliers', body);
  return data;
}

export async function updateSupplier(id: number, body: SupplierUpdate): Promise<SupplierRead> {
  const { data } = await apiClient.patch<SupplierRead>(`/suppliers/${id}`, body);
  return data;
}

export async function listGoodsReceipts(purchaseOrderId: number): Promise<GoodsReceiptRead[]> {
  const { data } = await apiClient.get<GoodsReceiptRead[]>('/goods-receipts', {
    params: { purchase_order_id: purchaseOrderId },
  });
  return data;
}

export async function receiveGoodsForPurchaseOrder(
  purchaseOrderId: number,
  body: GoodsReceiptReceiveRequest,
): Promise<GoodsReceiptRead> {
  const { data } = await apiClient.post<GoodsReceiptRead>(
    `/purchase-orders/${purchaseOrderId}/receive-goods`,
    body,
  );
  return data;
}

export async function listInvoiceScansForMatch(params?: {
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
  );
  return data;
}

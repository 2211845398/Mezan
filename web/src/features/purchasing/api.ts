import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

export type PurchaseOrderRead = components['schemas']['PurchaseOrderRead'];
export type PurchaseOrderCreate = components['schemas']['PurchaseOrderCreate'];
export type PurchaseOrderUpdate = components['schemas']['PurchaseOrderUpdate'];
export type PurchaseOrderLineCreate = components['schemas']['PurchaseOrderLineCreate'];
export type PurchaseOrderLineRead = components['schemas']['PurchaseOrderLineRead'];
export type PurchaseOrderSendRequest = components['schemas']['PurchaseOrderSendRequest'];
export type SupplierRead = components['schemas']['SupplierRead'] & {
  payment_terms_id?: number | null;
};
export type SupplierCreatePayload = {
  code?: string | null;
  first_name: string;
  father_name?: string | null;
  family_name?: string | null;
  currency_id?: number;
  currency_code?: string;
  payables_account_id?: number | null;
  tax_id?: string | null;
  contact?: Record<string, string>;
  payment_terms?: string | null;
  payment_terms_id?: number | null;
};
export type SupplierUpdatePayload = Partial<SupplierCreatePayload>;
export type GoodsReceiptRead = components['schemas']['GoodsReceiptRead'];
export type GoodsReceiptReceiveRequest = components['schemas']['GoodsReceiptReceiveRequest'];
import {
  applyCatalogMatches,
  getInvoiceScan,
  listInvoiceScans,
  postInvoiceMatch,
} from '@/features/invoice_scans/api';

export type {
  InvoiceMatchResponse,
  InvoiceScanApplyCatalogMatchesRequest,
  InvoiceScanRead,
} from '@/features/invoice_scans/api';
export {
  applyCatalogMatches,
  getInvoiceScan,
  listInvoiceScans,
  postInvoiceMatch,
};

/** @deprecated Use `listInvoiceScans` from `@/features/invoice_scans/api` */
export const listInvoiceScansForMatch = listInvoiceScans;

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

export async function createSupplier(body: SupplierCreatePayload): Promise<SupplierRead> {
  const { data } = await apiClient.post<SupplierRead>('/suppliers', body);
  return data;
}

export async function updateSupplier(id: number, body: SupplierUpdatePayload): Promise<SupplierRead> {
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
    { headers: { 'Idempotency-Key': body.idempotency_key } },
  );
  return data;
}

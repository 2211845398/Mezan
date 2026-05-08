import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

import type {
  InventoryPolicyRead,
  ReorderAlertRow,
  StockCardRead,
  StockMovement,
  StockOnHandRow,
  TransferRead,
} from './types';

export type { InvoiceScanRead } from '@/features/invoice_scans/api';
export {
  getInvoiceScan,
  listInvoiceScans,
  patchInvoiceScanOverride,
  postInvoiceScan,
  postValidateInvoiceScan,
} from '@/features/invoice_scans/api';

type TransferCreate = paths['/api/v1/transfers']['post']['requestBody']['content']['application/json'];

export type { StockMovement, TransferRead };

export async function listStockOnHand(params: {
  branch_id?: number;
  category_id?: number;
  q?: string;
  reorder_only?: boolean;
  status?: string;
  sort?: string;
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

export type StockAdjustmentBody = {
  branch_id: number;
  product_id: number;
  qty_delta: number;
  reason: string;
  idempotency_key: string;
};

export async function postStockAdjustment(
  body: StockAdjustmentBody,
): Promise<{ movement_id: number }> {
  const { data } = await apiClient.post('/inventory/adjustments', body);
  return data;
}

export type HumanMovementBody = {
  idempotency_key: string;
  branch_id: number;
  product_id: number;
  transaction_type:
    | 'add_stock'
    | 'issue_stock'
    | 'return_stock'
    | 'damage_mark'
    | 'damage_scrap'
    | 'reserve'
    | 'release'
    | 'count_adjust';
  quantity?: number;
  qty_signed?: number;
  notes?: string;
  reason?: string;
  /** Required when `transaction_type` is `add_stock` (goods receipt → WAVG). */
  unit_cost?: string | number;
};

export async function postHumanInventoryMovement(
  body: HumanMovementBody,
): Promise<{ movement_id: number }> {
  const { data } = await apiClient.post('/inventory/movements', body);
  return data;
}

export async function getInventoryPolicy(
  branchId: number,
  productId: number,
): Promise<InventoryPolicyRead> {
  const { data } = await apiClient.get<InventoryPolicyRead>(
    `/inventory/policies/${branchId}/${productId}`,
  );
  return data;
}

export async function patchInventoryPolicy(
  branchId: number,
  productId: number,
  body: {
    reorder_point: number;
    reorder_qty: number;
    preferred_supplier_id?: number | null;
    lead_time_days?: number | null;
    is_active?: boolean;
  },
): Promise<InventoryPolicyRead> {
  const { data } = await apiClient.patch<InventoryPolicyRead>(
    `/inventory/policies/${branchId}/${productId}`,
    body,
  );
  return data;
}

export async function listReorderAlerts(params?: { branch_id?: number }): Promise<ReorderAlertRow[]> {
  const { data } = await apiClient.get<ReorderAlertRow[]>('/inventory/reorder-alerts', { params });
  return data;
}

export async function postCreatePurchaseOrdersFromReorder(body?: {
  branch_ids?: number[];
  product_ids?: number[];
  idempotency_prefix?: string;
}): Promise<{ created: { purchase_order_id: number; branch_id: number; supplier_id: number }[] }> {
  const { data } = await apiClient.post('/inventory/reorder-alerts/create-purchase-order', body ?? {});
  return data;
}

export async function getProductStockCard(productId: number): Promise<StockCardRead> {
  const { data } = await apiClient.get<StockCardRead>(`/inventory/products/${productId}/stock-card`);
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

export async function deleteTransferBatch(id: number): Promise<void> {
  await apiClient.delete(`/transfers/${id}`);
}

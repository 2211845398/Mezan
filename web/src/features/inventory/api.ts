import { apiClient, isAxiosError } from '@/api/client';
import type { paths } from '@/api/generated/schema';
import { omitUndefined } from '@/lib/omitUndefined';

import type {
  CommercialRestockAlertRow,
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
  branch_kind?: 'commercial' | 'warehouse';
  category_id?: number;
  variant_id?: number;
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
  variant_id?: number;
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

export type ReservationRead = {
  movement_id: number;
  branch_id: number;
  branch_name: string;
  product_id: number;
  product_name: string;
  variant_id: number;
  variant_name: string;
  reference_code: string;
  qty_reserved: number;
  qty_released: number;
  qty_open: number;
  created_at: string;
  notes?: string | null;
  movement_kind?: string;
  ref_type?: string | null;
  ref_id?: string | null;
  transfer_batch_id?: number | null;
  releasable?: boolean;
};

export type HumanMovementBody = {
  idempotency_key: string;
  branch_id: number;
  product_id: number;
  variant_id?: number;
  uom_id?: number;
  reserve_movement_id?: number;
  transaction_type:
    | 'add_stock'
    | 'issue_stock'
    | 'return_stock'
    | 'damage_mark'
    | 'damage_scrap'
    | 'damage_unmark'
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

type HumanMovementBodyInput = {
  [K in keyof HumanMovementBody]: HumanMovementBody[K] | undefined;
};

export async function postHumanInventoryMovement(
  body: HumanMovementBodyInput,
): Promise<{ movement_id: number }> {
  const { data } = await apiClient.post('/inventory/movements', omitUndefined(body));
  return data;
}

export type AdhocReceiptLine = {
  product_id: number;
  qty: number;
  uom_id: number;
  unit_cost: string | number;
  variant_id?: number;
};

export async function postAdhocGoodsReceipt(body: {
  idempotency_key: string;
  branch_id: number;
  supplier_id?: number | null;
  notes?: string | null;
  lines: AdhocReceiptLine[];
}): Promise<{ movement_ids: number[] }> {
  const { data } = await apiClient.post('/inventory/receipts/adhoc', body);
  return data;
}

export async function listReservations(params?: {
  branch_id?: number;
  limit?: number;
}): Promise<ReservationRead[]> {
  const { data } = await apiClient.get<ReservationRead[]>('/inventory/reservations', { params });
  return data;
}

export type DamagedPositionRead = {
  branch_id: number;
  branch_name: string;
  product_id: number;
  product_name: string;
  variant_id: number;
  variant_name: string;
  reference_code: string;
  qty_damaged: number;
  movement_id?: number | null;
  reason?: string | null;
};

export async function listDamagedPositions(params?: {
  branch_id?: number;
  limit?: number;
}): Promise<DamagedPositionRead[]> {
  const { data } = await apiClient.get<DamagedPositionRead[]>('/inventory/damaged', { params });
  return data;
}

export async function postScrapDamaged(body: {
  idempotency_key: string;
  branch_id: number;
  product_id: number;
  variant_id?: number;
  quantity: number;
  uom_id?: number;
  notes?: string;
}): Promise<{ movement_id: number }> {
  const { data } = await apiClient.post('/inventory/damaged/scrap', body);
  return data;
}

export async function postUnmarkDamaged(body: {
  idempotency_key: string;
  branch_id: number;
  product_id: number;
  variant_id?: number;
  quantity: number;
  uom_id?: number;
  notes?: string;
}): Promise<{ movement_id: number }> {
  const { data } = await apiClient.post('/inventory/damaged/unmark', body);
  return data;
}

export async function postReleaseReservation(
  reserveMovementId: number,
  body: { idempotency_key: string; quantity: number; notes?: string },
): Promise<{ movement_id: number }> {
  const { data } = await apiClient.post(
    `/inventory/reservations/${reserveMovementId}/release`,
    body,
  );
  return data;
}

export type StockCountSessionRead = {
  id: number;
  branch_id: number;
  branch_name: string;
  version_no: number;
  status: string;
  category_id?: number | null;
  responsible_name: string;
  assigned_user_id?: number | null;
  created_by?: number | null;
  created_at: string;
  posted_at?: string | null;
  line_count: number;
};

export type StockCountLineRead = {
  id: number;
  product_id: number;
  variant_id: number;
  product_name: string;
  variant_name: string;
  reference_code: string;
  system_on_hand: number;
  system_reserved: number;
  system_damaged: number;
  counted_qty?: number | null;
  damaged_counted?: number | null;
  notes?: string | null;
  variance?: number | null;
};

export type StockCountSessionDetailRead = StockCountSessionRead & {
  lines: StockCountLineRead[];
};

export async function listStockCountSessions(params?: {
  branch_id?: number;
  limit?: number;
}): Promise<StockCountSessionRead[]> {
  const { data } = await apiClient.get<StockCountSessionRead[]>('/inventory/stock-count/sessions', {
    params,
  });
  return data;
}

export async function createStockCountSession(body: {
  branch_id: number;
  category_id?: number | null;
  category_include_descendants?: boolean;
  product_ids?: number[] | null;
  assigned_user_id: number;
  responsible_name?: string;
}): Promise<StockCountSessionDetailRead> {
  const { data } = await apiClient.post<StockCountSessionDetailRead>(
    '/inventory/stock-count/sessions',
    body,
  );
  return data;
}

export async function getStockCountSession(sessionId: number): Promise<StockCountSessionDetailRead> {
  const { data } = await apiClient.get<StockCountSessionDetailRead>(
    `/inventory/stock-count/sessions/${sessionId}`,
  );
  return data;
}

export async function patchStockCountLines(
  sessionId: number,
  lines: { id: number; counted_qty?: number | null; damaged_counted?: number | null; notes?: string | null }[],
): Promise<StockCountSessionDetailRead> {
  const { data } = await apiClient.patch<StockCountSessionDetailRead>(
    `/inventory/stock-count/sessions/${sessionId}/lines`,
    { lines },
  );
  return data;
}

export async function postStockCountSession(
  sessionId: number,
): Promise<{ session_id: number; movements_posted: number }> {
  const { data } = await apiClient.post(`/inventory/stock-count/sessions/${sessionId}/post`);
  return data;
}

export async function cancelStockCountSession(sessionId: number): Promise<void> {
  await apiClient.delete(`/inventory/stock-count/sessions/${sessionId}`);
}

export async function downloadStockCountSessionPdf(sessionId: number): Promise<string> {
  const res = await apiClient.get<Blob>(`/inventory/stock-count/sessions/${sessionId}/pdf`, {
    responseType: 'blob',
  });
  const blob = res.data;
  const disposition = res.headers['content-disposition'] as string | undefined;
  let filename = `stock_count_${sessionId}.pdf`;
  const match = disposition?.match(/filename="?([^";]+)"?/);
  if (match?.[1]) filename = match[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export async function listMyStockCountSessions(params?: {
  limit?: number;
}): Promise<StockCountSessionRead[]> {
  const { data } = await apiClient.get<StockCountSessionRead[]>(
    '/employees/me/stock-count-sessions',
    { params },
  );
  return data;
}

export async function getMyStockCountSession(
  sessionId: number,
): Promise<StockCountSessionDetailRead> {
  const { data } = await apiClient.get<StockCountSessionDetailRead>(
    `/employees/me/stock-count-sessions/${sessionId}`,
  );
  return data;
}

export async function patchMyStockCountLines(
  sessionId: number,
  lines: { id: number; counted_qty?: number | null; damaged_counted?: number | null; notes?: string | null }[],
): Promise<StockCountSessionDetailRead> {
  const { data } = await apiClient.patch<StockCountSessionDetailRead>(
    `/employees/me/stock-count-sessions/${sessionId}/lines`,
    { lines },
  );
  return data;
}

export async function downloadMyStockCountSessionPdf(sessionId: number): Promise<string> {
  const res = await apiClient.get<Blob>(`/employees/me/stock-count-sessions/${sessionId}/pdf`, {
    responseType: 'blob',
  });
  const blob = res.data;
  const disposition = res.headers['content-disposition'] as string | undefined;
  let filename = `stock_count_${sessionId}.pdf`;
  const match = disposition?.match(/filename="?([^";]+)"?/);
  if (match?.[1]) filename = match[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export async function downloadStockCountPdf(body: {
  branch_id: number;
  category_id?: number | null;
  category_include_descendants?: boolean;
  product_ids?: number[] | null;
  q?: string | null;
  responsible_name?: string;
}): Promise<string> {
  const res = await apiClient.post<Blob>('/inventory/stock-count/export', body, {
    responseType: 'blob',
  });
  const blob = res.data;
  const disposition = res.headers['content-disposition'] as string | undefined;
  let filename = 'stock_count.pdf';
  const match = disposition?.match(/filename="?([^";]+)"?/);
  if (match?.[1]) filename = match[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
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

/** Returns null when no policy exists yet (HTTP 404). */
export async function getInventoryPolicyOrNull(
  branchId: number,
  productId: number,
): Promise<InventoryPolicyRead | null> {
  try {
    return await getInventoryPolicy(branchId, productId);
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
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

export async function getReorderAlertCount(params?: { branch_id?: number }): Promise<{ count: number }> {
  const { data } = await apiClient.get<{ count: number }>('/inventory/reorder-alerts/count', { params });
  return data;
}

export async function listCommercialRestockAlerts(params?: {
  branch_id?: number;
}): Promise<CommercialRestockAlertRow[]> {
  const { data } = await apiClient.get<CommercialRestockAlertRow[]>(
    '/inventory/commercial-restock-alerts',
    { params },
  );
  return data;
}

export async function getCommercialRestockCount(params?: {
  branch_id?: number;
}): Promise<{ count: number }> {
  const { data } = await apiClient.get<{ count: number }>(
    '/inventory/commercial-restock-alerts/count',
    { params },
  );
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

export async function updateTransferBatch(id: number, body: TransferCreate): Promise<TransferRead> {
  const { data } = await apiClient.put<TransferRead>(`/transfers/${id}`, body);
  return data;
}

export async function postDispatchTransfer(
  id: number,
  body?: { branch_id?: number },
): Promise<TransferRead> {
  const { data } = await apiClient.post<TransferRead>(`/transfers/${id}/dispatch`, body ?? {});
  return data;
}

export async function postReceiveTransfer(
  id: number,
  body?: { branch_id?: number },
): Promise<TransferRead> {
  const { data } = await apiClient.post<TransferRead>(`/transfers/${id}/receive`, body ?? {});
  return data;
}

export async function deleteTransferBatch(id: number): Promise<void> {
  await apiClient.delete(`/transfers/${id}`);
}

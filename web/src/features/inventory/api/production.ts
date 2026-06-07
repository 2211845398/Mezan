import { apiClient } from '@/api/client';

export type BomLineRead = {
  id: number;
  component_product_id: number;
  component_product_name: string;
  qty_required: string | number;
  unit_cost_at_creation?: string | number | null;
  notes?: string | null;
};

export type BomRead = {
  id: number;
  name: string;
  finished_product_id: number;
  finished_product_name: string;
  version: string;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
};

export type BomDetailRead = BomRead & { lines: BomLineRead[] };

export type BomCostRead = {
  bom_id: number;
  finished_product_id: number;
  qty: string | number;
  unit_cost: string | number;
  total_cost: string | number;
  lines: Array<{
    product_id: number;
    product_name: string;
    qty: string | number;
    unit_cost: string | number;
    line_cost: string | number;
  }>;
};

export type ProductionOrderRead = {
  id: number;
  order_number: string;
  bom_id: number;
  bom_name: string;
  branch_id: number;
  branch_name: string;
  qty_to_produce: string | number;
  qty_produced: string | number;
  status: string;
  planned_start?: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  total_cost_issued: string | number;
  overhead_cost: string | number;
  finished_goods_value: string | number;
  notes?: string | null;
  created_at: string;
};

export async function listBoms(activeOnly = true): Promise<BomRead[]> {
  const { data } = await apiClient.get<BomRead[]>('/production/boms', {
    params: { active_only: activeOnly },
  });
  return data;
}

export async function getBom(bomId: number): Promise<BomDetailRead> {
  const { data } = await apiClient.get<BomDetailRead>(`/production/boms/${bomId}`);
  return data;
}

export async function createBom(body: {
  name: string;
  finished_product_id: number;
  version?: string;
  notes?: string | null;
}): Promise<BomRead> {
  const { data } = await apiClient.post<BomRead>('/production/boms', body);
  return data;
}

export async function addBomLine(
  bomId: number,
  branchId: number,
  body: { component_product_id: number; qty_required: string | number; notes?: string | null },
): Promise<BomLineRead> {
  const { data } = await apiClient.post<BomLineRead>(`/production/boms/${bomId}/lines`, body, {
    params: { branch_id: branchId },
  });
  return data;
}

export async function calculateBomCost(body: {
  bom_id: number;
  branch_id: number;
  qty?: string | number;
}): Promise<BomCostRead> {
  const { data } = await apiClient.post<BomCostRead>('/production/boms/calculate-cost', body);
  return data;
}

export async function listProductionOrders(params?: {
  branch_id?: number;
  status?: string;
}): Promise<ProductionOrderRead[]> {
  const { data } = await apiClient.get<ProductionOrderRead[]>('/production/orders', { params });
  return data;
}

export async function getProductionOrder(orderId: number): Promise<ProductionOrderRead> {
  const { data } = await apiClient.get<ProductionOrderRead>(`/production/orders/${orderId}`);
  return data;
}

export async function createProductionOrder(body: {
  bom_id: number;
  branch_id: number;
  qty_to_produce: string | number;
  notes?: string | null;
}): Promise<ProductionOrderRead> {
  const { data } = await apiClient.post<ProductionOrderRead>('/production/orders', body);
  return data;
}

export async function issueProductionOrder(
  orderId: number,
  idempotencyKey: string,
): Promise<ProductionOrderRead> {
  const { data } = await apiClient.post<ProductionOrderRead>(
    `/production/orders/${orderId}/issue`,
    null,
    { params: { idempotency_key: idempotencyKey } },
  );
  return data;
}

export async function completeProductionOrder(
  orderId: number,
  body: { overhead_cost: string | number },
  idempotencyKey: string,
): Promise<ProductionOrderRead> {
  const { data } = await apiClient.post<ProductionOrderRead>(
    `/production/orders/${orderId}/complete`,
    body,
    { params: { idempotency_key: idempotencyKey } },
  );
  return data;
}

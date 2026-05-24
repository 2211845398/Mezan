/** Inventory API shapes (manual until OpenAPI regen). */

export type StockOnHandRow = {
  branch_id: number;
  branch_name: string;
  product_id: number;
  variant_id: number;
  sku: string;
  variant_sku: string;
  variant_attributes: string;
  variant_name?: string;
  reference_code?: string;
  product_name: string;
  product_image_url?: string | null;
  category_id: number;
  category_name: string;
  on_hand: number;
  reserved: number;
  damaged: number;
  available: number;
  unit_cost: string;
  extended_cost: string;
  on_order: number;
  in_transit_in: number;
  in_transit_out: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  preferred_supplier_id: number | null;
  reorder_status: string;
  days_of_cover: number | null;
  consumption_rate_30d: number;
};

export type StockMovement = {
  id: number;
  branch_id: number;
  branch_name?: string;
  product_id: number;
  product_name?: string;
  qty_delta: number;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
  movement_kind?: string | null;
  notes?: string | null;
  user_id?: number | null;
  reserved_delta?: number | null;
  damaged_delta?: number | null;
  created_at: string;
};

export type TransferLineRead = {
  id: number;
  product_id: number;
  variant_id?: number | null;
  qty: number;
  qty_base?: number;
  uom_id?: number;
  uom_name?: string;
  product_name?: string;
  variant_sku?: string;
  variant_name?: string;
  reference_code?: string;
  variant_attributes?: string;
};

export type TransferRead = {
  id: number;
  from_branch_id: number;
  to_branch_id: number;
  from_branch_name?: string;
  to_branch_name?: string;
  status: string;
  created_by_user_id: number | null;
  created_by_user_name?: string | null;
  dispatched_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
  lines: TransferLineRead[];
};

export type InventoryPolicyRead = {
  id: number;
  branch_id: number;
  product_id: number;
  reorder_point: number;
  reorder_qty: number;
  preferred_supplier_id: number | null;
  lead_time_days: number | null;
  is_active: boolean;
};

export type ReorderAlertRow = {
  branch_id: number;
  branch_name: string;
  product_id: number;
  sku: string;
  product_name: string;
  available: number;
  on_order: number;
  in_transit_in: number;
  cover: number;
  reorder_point: number;
  reorder_qty: number;
  preferred_supplier_id: number | null;
  supplier_name: string | null;
  severity: string;
};

export type StockCardRead = {
  product_id: number;
  sku: string;
  product_name: string;
  category_id: number;
  category_name: string;
  branches: Array<{
    branch_id: number;
    branch_name: string;
    on_hand: number;
    reserved: number;
    damaged: number;
    available: number;
    on_order: number;
    in_transit_in: number;
    in_transit_out: number;
    reorder_point: number | null;
    reorder_qty: number | null;
    preferred_supplier_id: number | null;
    reorder_status: string;
    days_of_cover: number | null;
    consumption_rate_30d: number;
  }>;
  recent_movements: StockMovement[];
};

import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

export type ExecutiveKpiRead = components['schemas']['ExecutiveKpiRead'];

export type CategoryRevenueRow = {
  category_id: number;
  category_name: string;
  gross_sales: string;
  invoice_count: number;
};

export type CategoryProductRevenueRow = {
  product_id: number;
  product_name: string;
  gross_sales: string;
  qty_sold: number;
  invoice_count: number;
};

export type CategoryRevenueBreakdownRead = {
  category_id: number;
  period_start: string | null;
  period_end: string | null;
  branch_id: number | null;
  self: CategoryRevenueRow;
  children: CategoryRevenueRow[];
  products: CategoryProductRevenueRow[];
};

export async function getExecutiveKpis(params?: {
  period_start?: string;
  period_end?: string;
  branch_id?: number;
}): Promise<ExecutiveKpiRead> {
  const { data } = await apiClient.get<ExecutiveKpiRead>('/bi/executive-kpis', { params });
  return data;
}

export async function getCategoryRevenue(
  categoryId: number,
  params?: {
    period_start?: string;
    period_end?: string;
    branch_id?: number;
  },
): Promise<CategoryRevenueBreakdownRead> {
  const { data } = await apiClient.get<CategoryRevenueBreakdownRead>(
    `/bi/categories/${categoryId}/revenue`,
    { params },
  );
  return data;
}

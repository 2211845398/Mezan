import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';
import { assertInvoicePkId, isValidInvoicePkId } from '@/lib/salesInvoiceId';

export type MarketingAdvisoryRequest = components['schemas']['MarketingAdvisoryRequest'];
export type MarketingAdvisoryResponse = components['schemas']['MarketingAdvisoryResponse'];
export type TopSellingProductsResponse = components['schemas']['TopSellingProductsResponse'];
export type SlowMovingProductsResponse = components['schemas']['SlowMovingProductsResponse'];
export type InventoryAlertsResponse = components['schemas']['InventoryAlertsResponse'];
export type PromotionPerformanceResponse = components['schemas']['PromotionPerformanceResponse'];
export type PromotionPerformanceItem = components['schemas']['PromotionPerformanceItem'];
export type TargetedCampaignRequest = components['schemas']['TargetedCampaignRequest'];
export type TargetedCampaignResponse = components['schemas']['TargetedCampaignResponse'];
export type CampaignSegmentExportRequest = components['schemas']['CampaignSegmentExportRequest'];

export async function getTopSellingProducts(params?: {
  limit?: number;
  period_start?: string;
  period_end?: string;
}): Promise<TopSellingProductsResponse> {
  const { data } = await apiClient.get<TopSellingProductsResponse>('/marketing/analytics/top-products', {
    params,
  });
  return data;
}

export async function getSlowMovingProducts(params?: {
  threshold_qty?: number;
  limit?: number;
}): Promise<SlowMovingProductsResponse> {
  const { data } = await apiClient.get<SlowMovingProductsResponse>(
    '/marketing/analytics/slow-products',
    { params },
  );
  return data;
}

export async function getInventoryAlerts(params?: { days_ahead?: number }): Promise<InventoryAlertsResponse> {
  const { data } = await apiClient.get<InventoryAlertsResponse>(
    '/marketing/analytics/inventory-alerts',
    { params },
  );
  return data;
}

export async function getPromotionPerformance(params?: {
  limit?: number;
}): Promise<PromotionPerformanceResponse> {
  const { data } = await apiClient.get<PromotionPerformanceResponse>(
    '/marketing/analytics/promotion-performance',
    { params },
  );
  return data;
}

export type SalesTrendChartResponse = {
  period_days: number;
  period_start?: string | null;
  period_end?: string | null;
  data: { date: string; total: number; count: number }[];
};

export async function getSalesTrendChart(params?: {
  days?: number;
  period_start?: string;
  period_end?: string;
}): Promise<SalesTrendChartResponse> {
  const { data } = await apiClient.get<SalesTrendChartResponse>('/marketing/analytics/charts/sales-trend', {
    params,
  });
  return data;
}

/** Branch-period invoice register (non-POS daily list). Mirrors backend `SalesInvoiceRegisterPageRead`. */
export type SalesInvoiceRegisterRow = {
  id: number;
  invoice_number: string;
  invoice_barcode: string;
  cart_id: number;
  terminal_id: number;
  branch_id: number;
  customer_id: number | null;
  customer_display: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  payment_status: string;
  transaction_type: string;
  created_at: string;
};

export type SalesInvoiceRegisterPageRead = {
  items: SalesInvoiceRegisterRow[];
  total_count: number;
  sum_subtotal: string;
  sum_total: string;
};

export async function getSalesInvoicesRegister(params: {
  branch_id: number;
  period_start: string;
  period_end: string;
  limit?: number;
  offset?: number;
}): Promise<SalesInvoiceRegisterPageRead> {
  const { data } = await apiClient.get<SalesInvoiceRegisterPageRead>('/sales-invoices/register', {
    params,
  });
  const items = data.items.filter((item) => {
    if (!isValidInvoicePkId(item.id)) {
      console.warn('Sales register row skipped: invalid numeric id', item);
      return false;
    }
    return true;
  }) as SalesInvoiceRegisterRow[];
  return { ...data, items };
}

export async function exportSalesRegisterPdfBlob(params: {
  branch_id: number;
  period_start: string;
  period_end: string;
  limit?: number;
  offset?: number;
}): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/sales-invoices/register/export.pdf', {
    params,
    responseType: 'blob',
  });
  return data;
}

export async function exportSalesRegisterXlsxBlob(params: {
  branch_id: number;
  period_start: string;
  period_end: string;
  limit?: number;
  offset?: number;
}): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/sales-invoices/register/export.xlsx', {
    params,
    responseType: 'blob',
  });
  return data;
}

export async function exportDailySalesSummaryPdfBlob(params: {
  period_start: string;
  period_end: string;
  branch_id?: number;
}): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/sales-invoices/daily-summary/export.pdf', {
    params,
    responseType: 'blob',
  });
  return data;
}

export async function exportDailySalesSummaryXlsxBlob(params: {
  period_start: string;
  period_end: string;
  branch_id?: number;
}): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/sales-invoices/daily-summary/export.xlsx', {
    params,
    responseType: 'blob',
  });
  return data;
}

export async function exportSalesInvoicePdfBlob(invoiceId: number): Promise<Blob> {
  const id = assertInvoicePkId(invoiceId);
  const { data } = await apiClient.get<Blob>(`/sales-invoices/${id}/export.pdf`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportSalesInvoiceXlsxBlob(invoiceId: number): Promise<Blob> {
  const id = assertInvoicePkId(invoiceId);
  const { data } = await apiClient.get<Blob>(`/sales-invoices/${id}/export.xlsx`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportCreditNotePdfBlob(creditNoteId: number): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/credit-notes/${creditNoteId}/export.pdf`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportCreditNoteXlsxBlob(creditNoteId: number): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/credit-notes/${creditNoteId}/export.xlsx`, {
    responseType: 'blob',
  });
  return data;
}

export async function postMarketingAdvisory(body: MarketingAdvisoryRequest): Promise<MarketingAdvisoryResponse> {
  const { data } = await apiClient.post<MarketingAdvisoryResponse>(
    '/marketing/advisory/suggestions',
    body,
  );
  return data;
}

export async function postTargetedCampaigns(body: TargetedCampaignRequest): Promise<TargetedCampaignResponse> {
  const { data } = await apiClient.post<TargetedCampaignResponse>('/ai/advisory/campaigns', body);
  return data;
}

export async function postCampaignSegmentExport(body: CampaignSegmentExportRequest): Promise<Blob> {
  const { data } = await apiClient.post<Blob>('/ai/advisory/campaigns/segment-export', body, {
    responseType: 'blob',
  });
  return data;
}

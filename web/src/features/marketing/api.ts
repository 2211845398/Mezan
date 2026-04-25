import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

export type MarketingAdvisoryRequest = components['schemas']['MarketingAdvisoryRequest'];
export type MarketingAdvisoryResponse = components['schemas']['MarketingAdvisoryResponse'];
export type TopSellingProductsResponse = components['schemas']['TopSellingProductsResponse'];
export type SlowMovingProductsResponse = components['schemas']['SlowMovingProductsResponse'];
export type InventoryAlertsResponse = components['schemas']['InventoryAlertsResponse'];
export type PromotionPerformanceResponse = components['schemas']['PromotionPerformanceResponse'];
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

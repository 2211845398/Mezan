import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

export type CustomerListResponse = components['schemas']['CustomerListResponse'];
export type CustomerListItemRead = components['schemas']['CustomerListItemRead'];
export type CustomerDetailRead = components['schemas']['CustomerDetailRead'];
export type CustomerCreateStaff = components['schemas']['CustomerCreateStaff'];
export type CustomerUpdate = components['schemas']['CustomerUpdate'];
export type CustomerSalesInvoiceListResponse = components['schemas']['CustomerSalesInvoiceListResponse'];

export type CustomerPerformanceRead = {
  customer_id: number;
  customer_name: string;
  period_days: number;
  metrics: {
    total_spend_period: string;
    total_spend_lifetime: string;
    purchase_count: number;
    average_order_value: string;
    lifetime_value: string;
    loyalty_points_balance: number;
    open_debt: string;
    exchanges_last_90_days: number;
  };
  visits: {
    last_visit: string | null;
    first_visit: string | null;
    visit_trend: string;
    visits_last_90_days: number;
    visits_previous_90_days: number;
  };
  top_products: Array<{
    product_id: number;
    product_name: string;
    total_qty: number;
    total_spend: string;
  }>;
};

export type AccrualRuleRead = components['schemas']['AccrualRuleRead'];
export type AccrualRuleCreate = components['schemas']['AccrualRuleCreate'];
export type AccrualRuleUpdate = components['schemas']['AccrualRuleUpdate'];

export type DiscountRuleRead = components['schemas']['DiscountRuleRead'];
export type DiscountRuleCreate = components['schemas']['DiscountRuleCreate'];
export type DiscountRuleUpdate = components['schemas']['DiscountRuleUpdate'];

export type LedgerEntryRead = components['schemas']['LedgerEntryRead'];
export type ManualPointAdjustment = components['schemas']['ManualPointAdjustment'];

export async function listCustomers(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  activation?: 'all' | 'active' | 'pending' | 'suspended';
  pos_ready?: boolean;
}): Promise<CustomerListResponse> {
  const { data } = await apiClient.get<CustomerListResponse>('/customers', { params });
  return data;
}

export type CreateTemporaryCustomerResponse = {
  customer: components['schemas']['CustomerRead'];
  onboarding_token: string;
  onboarding_path: string;
  qr_url: string;
};

export async function createTemporaryCustomer(
  body: components['schemas']['CustomerCreateTemporaryRequest'],
): Promise<CreateTemporaryCustomerResponse> {
  const { data } = await apiClient.post<CreateTemporaryCustomerResponse>('/customers/temporary', body);
  return data;
}

export async function completeCustomerOnboarding(
  body: components['schemas']['CustomerCompleteOnboardingRequest'],
): Promise<components['schemas']['CustomerRead']> {
  const { data } = await apiClient.post<components['schemas']['CustomerRead']>(
    '/customers/onboarding/complete',
    body,
  );
  return data;
}

export async function getCustomer(id: number): Promise<CustomerDetailRead> {
  const { data } = await apiClient.get<CustomerDetailRead>(`/customers/${id}`);
  return data;
}

export async function createCustomer(body: CustomerCreateStaff): Promise<CustomerDetailRead> {
  const { data } = await apiClient.post<CustomerDetailRead>('/customers', body);
  return data;
}

export async function updateCustomer(id: number, body: CustomerUpdate): Promise<CustomerDetailRead> {
  const { data } = await apiClient.patch<CustomerDetailRead>(`/customers/${id}`, body);
  return data;
}

export async function listCustomerSalesInvoices(
  customerId: number,
  params?: { limit?: number; offset?: number },
): Promise<CustomerSalesInvoiceListResponse> {
  const { data } = await apiClient.get<CustomerSalesInvoiceListResponse>(
    `/customers/${customerId}/sales-invoices`,
    { params },
  );
  return data;
}

export async function getCustomerPerformance(
  customerId: number,
  params?: { days_back?: number },
): Promise<CustomerPerformanceRead> {
  const { data } = await apiClient.get<CustomerPerformanceRead>(
    `/crm/customers/${customerId}/performance`,
    { params },
  );
  return data;
}

export async function listAccrualRules(): Promise<AccrualRuleRead[]> {
  const { data } = await apiClient.get<AccrualRuleRead[]>('/loyalty/rules');
  return data;
}

export async function getAccrualRule(id: number): Promise<AccrualRuleRead> {
  const { data } = await apiClient.get<AccrualRuleRead>(`/loyalty/rules/${id}`);
  return data;
}

export async function createAccrualRule(body: AccrualRuleCreate): Promise<AccrualRuleRead> {
  const { data } = await apiClient.post<AccrualRuleRead>('/loyalty/rules', body);
  return data;
}

export async function updateAccrualRule(id: number, body: AccrualRuleUpdate): Promise<AccrualRuleRead> {
  const { data } = await apiClient.patch<AccrualRuleRead>(`/loyalty/rules/${id}`, body);
  return data;
}

export async function listDiscountRules(params?: {
  status_filter?: string;
  limit?: number;
  offset?: number;
}): Promise<DiscountRuleRead[]> {
  const { data } = await apiClient.get<DiscountRuleRead[]>('/discounts', { params });
  return data;
}

export async function getDiscountRule(id: number): Promise<DiscountRuleRead> {
  const { data } = await apiClient.get<DiscountRuleRead>(`/discounts/${id}`);
  return data;
}

export async function createDiscountRule(body: DiscountRuleCreate): Promise<DiscountRuleRead> {
  const { data } = await apiClient.post<DiscountRuleRead>('/discounts', body);
  return data;
}

export async function updateDiscountRule(id: number, body: DiscountRuleUpdate): Promise<DiscountRuleRead> {
  const { data } = await apiClient.patch<DiscountRuleRead>(`/discounts/${id}`, body);
  return data;
}

export async function getLoyaltyLedger(
  customerId: number,
  params?: { limit?: number; offset?: number },
): Promise<LedgerEntryRead[]> {
  const { data } = await apiClient.get<LedgerEntryRead[]>(`/loyalty/customers/${customerId}/ledger`, {
    params,
  });
  return data;
}

export async function postLoyaltyAdjustment(body: ManualPointAdjustment): Promise<LedgerEntryRead> {
  const { data } = await apiClient.post<LedgerEntryRead>('/loyalty/adjustments', body);
  return data;
}

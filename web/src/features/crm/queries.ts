import { queryOptions } from '@tanstack/react-query';

import * as api from './api';

export const crmKeys = {
  root: ['crm'] as const,
  customers: (q: { limit: number; offset: number; search?: string; activation?: string }) =>
    [...crmKeys.root, 'customers', q] as const,
  customer: (id: number) => [...crmKeys.root, 'customer', id] as const,
  customerPerformance: (id: number, daysBack: number) =>
    [...crmKeys.root, 'customer', id, 'performance', daysBack] as const,
  customerInvoices: (id: number, q: { limit: number; offset: number }) =>
    [...crmKeys.root, 'customer', id, 'invoices', q] as const,
  loyaltyRules: () => [...crmKeys.root, 'loyalty', 'rules'] as const,
  loyaltyRule: (id: number) => [...crmKeys.root, 'loyalty', 'rule', id] as const,
  loyaltyLedger: (customerId: number, q: { limit: number; offset: number }) =>
    [...crmKeys.root, 'loyalty', 'ledger', customerId, q] as const,
  discounts: (q: { status?: string; limit: number; offset: number }) =>
    [...crmKeys.root, 'discounts', q] as const,
  discount: (id: number) => [...crmKeys.root, 'discount', id] as const,
  /** POS customer picker: keyed by debounced search string. */
  customersPosPickerSearch: (search: string) =>
    [...crmKeys.root, 'customers', 'pos-picker', search] as const,
};

export function customersListQueryOptions(args: {
  limit: number;
  offset: number;
  search?: string;
  activation?: 'all' | 'active' | 'pending';
}) {
  return queryOptions({
    queryKey: crmKeys.customers(args),
    queryFn: () => api.listCustomers(args),
  });
}

export function customerDetailQueryOptions(id: number) {
  return queryOptions({
    queryKey: crmKeys.customer(id),
    queryFn: () => api.getCustomer(id),
    enabled: !Number.isNaN(id) && id > 0,
  });
}

export function customerInvoicesQueryOptions(
  customerId: number,
  args: { limit: number; offset: number },
) {
  return queryOptions({
    queryKey: crmKeys.customerInvoices(customerId, args),
    queryFn: () => api.listCustomerSalesInvoices(customerId, args),
    enabled: customerId > 0,
  });
}

export function customerPerformanceQueryOptions(customerId: number, daysBack: number) {
  return queryOptions({
    queryKey: crmKeys.customerPerformance(customerId, daysBack),
    queryFn: () => api.getCustomerPerformance(customerId, { days_back: daysBack }),
    enabled: customerId > 0,
  });
}

export function accrualRulesQueryOptions() {
  return queryOptions({
    queryKey: crmKeys.loyaltyRules(),
    queryFn: () => api.listAccrualRules(),
  });
}

export function accrualRuleQueryOptions(id: number) {
  return queryOptions({
    queryKey: crmKeys.loyaltyRule(id),
    queryFn: () => api.getAccrualRule(id),
    enabled: id > 0,
  });
}

export function discountsListQueryOptions(args: { status?: string; limit: number; offset: number }) {
  return queryOptions({
    queryKey: crmKeys.discounts(args),
    queryFn: () => {
      const p: { status_filter?: string; limit?: number; offset?: number } = {
        limit: args.limit,
        offset: args.offset,
      };
      if (args.status !== undefined) p.status_filter = args.status;
      return api.listDiscountRules(p);
    },
  });
}

export function discountDetailQueryOptions(id: number) {
  return queryOptions({
    queryKey: crmKeys.discount(id),
    queryFn: () => api.getDiscountRule(id),
    enabled: id > 0,
  });
}

export function loyaltyLedgerQueryOptions(
  customerId: number,
  args: { limit: number; offset: number },
) {
  return queryOptions({
    queryKey: crmKeys.loyaltyLedger(customerId, args),
    queryFn: () => api.getLoyaltyLedger(customerId, args),
    enabled: customerId > 0,
  });
}

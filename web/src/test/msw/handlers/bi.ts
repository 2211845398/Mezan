import { http, HttpResponse } from 'msw';

import type { ExecutiveKpiRead } from '@/api/types';

const BASE = '/api/v1';

const MOCK_KPIS: ExecutiveKpiRead = {
  invoice_count: 42,
  gross_sales: '12500.50',
  period_start: '2026-05-01',
  period_end: '2026-06-01',
  branch_id: null,
  avg_ticket: '297.63',
  estimated_cogs: '8000',
  gross_margin_ratio: '0.36',
  loyalty_points_accrued: 0,
  revenue_trend: [{ bucket_date: '2026-05-15', gross_sales: '1000' }],
  category_mix: [{ category_id: 1, category_name: 'Beverages', gross_sales: '500' }],
  top_products: [
    {
      product_id: 10,
      product_name: 'Rice 5kg Bag',
      qty_sold: 15,
      revenue: '213.90',
    },
  ],
  recent_purchase_orders: [
    {
      id: 501,
      supplier_name: 'Fresh Foods Ltd',
      status: 'closed',
      branch_id: 1,
      created_at: '2026-06-05T10:00:00Z',
    },
  ],
};

const MOCK_CATEGORY_REVENUE = {
  category_id: 1,
  period_start: null,
  period_end: null,
  branch_id: null,
  self: {
    category_id: 1,
    category_name: 'Beverages',
    gross_sales: '500',
    invoice_count: 3,
  },
  children: [
    {
      category_id: 2,
      category_name: 'Soft drinks',
      gross_sales: '200',
      invoice_count: 1,
    },
  ],
  products: [
    {
      product_id: 10,
      product_name: 'Rice 5kg Bag',
      gross_sales: '213.90',
      qty_sold: 15,
      invoice_count: 5,
    },
  ],
};

export const biHandlers = [
  http.get(`${BASE}/bi/executive-kpis`, () => HttpResponse.json(MOCK_KPIS)),
  http.get(`${BASE}/bi/categories/:categoryId/revenue`, () =>
    HttpResponse.json(MOCK_CATEGORY_REVENUE),
  ),
];

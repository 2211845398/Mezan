import { http, HttpResponse } from 'msw';

import type { ExecutiveKpiRead } from '@/api/types';

const BASE = '/api/v1';

const MOCK_KPIS: ExecutiveKpiRead = {
  invoice_count: 0,
  gross_sales: '0',
  period_start: null,
  period_end: null,
  branch_id: null,
};

export const biHandlers = [http.get(`${BASE}/bi/executive-kpis`, () => HttpResponse.json(MOCK_KPIS))];

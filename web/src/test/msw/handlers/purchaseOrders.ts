import { http, HttpResponse } from 'msw';

import type { PurchaseOrderRead } from '@/api/types';

const BASE = '/api/v1';

export const purchaseOrderHandlers = [
  http.get(`${BASE}/purchase-orders`, () => HttpResponse.json([] satisfies PurchaseOrderRead[])),
];

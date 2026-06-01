import { http, HttpResponse } from 'msw';

import type { ProductRead } from '@/api/types';

const BASE = '/api/v1';

export const productHandlers = [
  http.get(`${BASE}/products`, () =>
    HttpResponse.json({
      items: [] satisfies ProductRead[],
      total: 0,
      limit: 20,
      offset: 0,
    }),
  ),
];

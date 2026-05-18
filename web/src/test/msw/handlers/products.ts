import { http, HttpResponse } from 'msw';

import type { ProductRead } from '@/api/types';

const BASE = '/api/v1';

export const productHandlers = [
  http.get(`${BASE}/products`, () =>
    HttpResponse.json([] satisfies ProductRead[], {
      headers: { 'x-total-count': '0' },
    }),
  ),
];

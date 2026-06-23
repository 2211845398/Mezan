import { http, HttpResponse } from 'msw';

import type { ProductRead } from '@/api/types';

const BASE = '/api/v1';
const ts = '2024-01-01T00:00:00Z';

export const MOCK_PRODUCT: ProductRead = {
  id: 10,
  category_id: 1,
  category_ids: [1, 2],
  name: 'Summer Polo Shirt',
  sku: 'POLO-001',
  status: 'active',
  uom_id: 1,
  alternative_uoms: [],
  output_vat_rate: '0',
  tax_definition_ids: [1],
  image_url: null,
  created_at: ts,
  updated_at: ts,
};

export const productHandlers = [
  http.get(`${BASE}/products`, () =>
    HttpResponse.json({
      items: [MOCK_PRODUCT] satisfies ProductRead[],
      total: 1,
      limit: 20,
      offset: 0,
    }),
  ),
  http.get(`${BASE}/products/:productId`, ({ params }) => {
    if (Number(params.productId) === MOCK_PRODUCT.id) {
      return HttpResponse.json(MOCK_PRODUCT);
    }
    return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
  }),
  http.get(`${BASE}/products/:productId/with-variants`, ({ params }) => {
    if (Number(params.productId) !== MOCK_PRODUCT.id) {
      return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json({
      product: MOCK_PRODUCT,
      axes: [],
      variants: [],
      variant_count: 0,
    });
  }),
  http.get(`${BASE}/tax-definitions`, () =>
    HttpResponse.json([
      { id: 1, name: 'VAT', code: 'VAT', rate: '0.05', is_active: true },
    ]),
  ),
  http.get(`${BASE}/units-of-measure`, () =>
    HttpResponse.json([
      {
        id: 1,
        code: 'PIECE',
        name: 'Piece',
        symbol: 'pc',
        measurement_category: 'discrete',
      },
    ]),
  ),
];

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

describe('W-5.3 catalog API wiring', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('listProducts is called after MSW /products', async () => {
    const mod = await import('../api');
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json([
          {
            id: 1,
            category_id: 1,
            name: 'Test',
            sku: 'T1',
            status: 'active',
            output_vat_rate: '0',
            attributes: { price: 9.99 },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ]),
      ),
    );
    const rows = await mod.listProducts({ limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sku).toBe('T1');
  });
});

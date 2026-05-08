import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

describe('W-5.3 inventory API wiring', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('postStockAdjustment returns movement_id from MSW', async () => {
    const mod = await import('../api');
    server.use(
      http.post(`${API}/inventory/adjustments`, () =>
        HttpResponse.json({ movement_id: 42 }, { status: 200 }),
      ),
    );
    const res = await mod.postStockAdjustment({
      branch_id: 1,
      product_id: 2,
      qty_delta: -1,
      reason: 'test',
      idempotency_key: 'a'.repeat(12),
    });
    expect(res).toEqual({ movement_id: 42 });
  });

  it('postHumanInventoryMovement hits MSW', async () => {
    const mod = await import('../api');
    server.use(
      http.post(`${API}/inventory/movements`, () =>
        HttpResponse.json({ movement_id: 9 }, { status: 200 }),
      ),
    );
    const res = await mod.postHumanInventoryMovement({
      idempotency_key: 'b'.repeat(12),
      branch_id: 1,
      product_id: 2,
      transaction_type: 'add_stock',
      quantity: 3,
      unit_cost: '10.5000',
    });
    expect(res).toEqual({ movement_id: 9 });
  });
});

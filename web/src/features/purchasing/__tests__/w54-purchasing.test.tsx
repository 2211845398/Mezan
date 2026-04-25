import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import { RequirePermission } from '@/routes/guards';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen } from '@/test/utils';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

describe('W-5.4 purchasing', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('sendPurchaseOrder posts body idempotency_key', async () => {
    const mod = await import('../api');
    let body: unknown;
    server.use(
      http.post(`${API}/purchase-orders/1/send`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 1, status: 'sent' }, { status: 200 });
      }),
    );
    await mod.sendPurchaseOrder(1, { idempotency_key: 'idem'.padEnd(12, '0') }, 'hdr-key');
    expect(body).toEqual({ idempotency_key: 'idem00000000' });
  });

  it('receiveGoodsForPurchaseOrder posts idempotency in JSON body', async () => {
    const mod = await import('../api');
    let body: unknown;
    server.use(
      http.post(`${API}/purchase-orders/9/receive-goods`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 1, lines: [] }, { status: 200 });
      }),
    );
    await mod.receiveGoodsForPurchaseOrder(9, {
      branch_id: 1,
      lines: [{ purchase_order_line_id: 2, qty: 1 }],
      idempotency_key: 'b'.repeat(12),
    });
    expect(body).toMatchObject({
      branch_id: 1,
      idempotency_key: 'b'.repeat(12),
    });
  });

  it('approve-all apply-catalog-matches: single POST', async () => {
    const mod = await import('../api');
    let posts = 0;
    server.use(
      http.post(`${API}/invoice-scans/3/apply-catalog-matches`, async () => {
        posts += 1;
        return HttpResponse.json({ id: 3, status: 'needs_review' }, { status: 200 });
      }),
    );
    await mod.applyCatalogMatches(3, {
      idempotency_key: 'c'.repeat(12),
      line_matches: [
        { line_no: 1, product_id: 10 },
        { line_no: 2, product_id: null },
      ],
    });
    expect(posts).toBe(1);
  });

  it('user without purchase_orders:create gets /403 on new order route', () => {
    useAuthStore.getState().clear();
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'purchase_orders', action: 'read' }]);

    function ForbiddenStub() {
      return <div>forbidden</div>;
    }
    function NewOrderStub() {
      return <div>new-po</div>;
    }

    renderWithProviders(
      <Routes>
        <Route
          path="/purchasing/orders/new"
          element={
            <RequirePermission resource="purchase_orders" action="create">
              <NewOrderStub />
            </RequirePermission>
          }
        />
        <Route path="/403" element={<ForbiddenStub />} />
      </Routes>,
      { initialEntries: ['/purchasing/orders/new'] },
    );

    expect(screen.getByText('forbidden')).toBeInTheDocument();
    expect(screen.queryByText('new-po')).toBeNull();
  });
});

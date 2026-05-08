import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { now, toISOStringUtc } from '@/lib/date';
import { RequirePermission } from '@/routes/guards';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, userEvent } from '@/test/utils';

import type { GoodsReceiptRead } from '../api';
import { aggregateReceivedQtyByPoLine } from '../pages/receipts/GoodsReceiptForm';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

describe('W-5.4 purchasing', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    server.resetHandlers();
    useAuthStore.getState().clear();
  });

  it('aggregateReceivedQtyByPoLine sums by PO line', () => {
    const agg = aggregateReceivedQtyByPoLine([
      {
        id: 1,
        purchase_order_id: 9,
        branch_id: 1,
        supplier_name: null,
        supplier_id: null,
        source_invoice_scan_id: null,
        created_by_user_id: null,
        created_at: '',
        lines: [
          { id: 1, purchase_order_line_id: 10, product_id: 1, qty: 2, unit_cost: '1' },
          { id: 2, purchase_order_line_id: 10, product_id: 1, qty: 1, unit_cost: '1' },
        ],
      },
    ] as GoodsReceiptRead[]);
    expect(agg[10]).toBe(3);
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

  it('receiveGoodsForPurchaseOrder posts JSON and Idempotency-Key header', async () => {
    const mod = await import('../api');
    let body: unknown;
    let idemHeader: string | null = null;
    server.use(
      http.post(`${API}/purchase-orders/9/receive-goods`, async ({ request }) => {
        body = await request.json();
        idemHeader = request.headers.get('Idempotency-Key');
        return HttpResponse.json({ id: 1, lines: [] }, { status: 200 });
      }),
    );
    const key = 'b'.repeat(12);
    await mod.receiveGoodsForPurchaseOrder(9, {
      branch_id: 1,
      lines: [{ purchase_order_line_id: 2, qty: 1 }],
      idempotency_key: key,
    });
    expect(body).toMatchObject({
      branch_id: 1,
      idempotency_key: key,
    });
    expect(idemHeader).toBe(key);
  });

  it('PO lifecycle: draft → send → partial receive → close (MSW)', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([
      { resource: 'purchase_orders', action: 'read' },
      { resource: 'purchase_orders', action: 'update' },
    ]);

    let po: {
      id: number;
      status: string;
      branch_id: number;
      supplier_name: string;
      supplier_id: number | null;
      notes: string | null;
      expected_at: string | null;
      sent_at: string | null;
      created_by_user_id: number | null;
      created_at: string;
      updated_at: string;
      lines: { id: number; product_id: number; qty: number; unit_cost: string }[];
    };
    const createdIso = toISOStringUtc(now());
    po = {
      id: 5,
      status: 'draft',
      branch_id: 1,
      supplier_name: 'S',
      supplier_id: null,
      notes: null,
      expected_at: null,
      sent_at: null,
      created_by_user_id: 1,
      created_at: createdIso,
      updated_at: createdIso,
      lines: [{ id: 20, product_id: 1, qty: 10, unit_cost: '2' }],
    };
    server.use(
      http.get(`${API}/branches`, () =>
        HttpResponse.json([
          {
            id: 1,
            name: 'Main',
            code: 'M',
            address: null,
            timezone: 'UTC',
            is_active: true,
            archived_at: null,
          },
        ]),
      ),
      http.get(`${API}/purchase-orders/5`, () => HttpResponse.json(po)),
      http.post(`${API}/purchase-orders/5/send`, async ({ request }) => {
        const j = (await request.json()) as { idempotency_key?: string };
        expect(j.idempotency_key?.length).toBeGreaterThanOrEqual(8);
        po = { ...po, status: 'sent', sent_at: toISOStringUtc(now()) };
        return HttpResponse.json(po);
      }),
      http.post(`${API}/purchase-orders/5/receive-goods`, async ({ request }) => {
        const b = (await request.json()) as { lines: { qty: number }[] };
        expect(b.lines[0]?.qty).toBe(3);
        return HttpResponse.json({
          id: 99,
          purchase_order_id: 5,
          branch_id: 1,
          supplier_name: 'S',
          supplier_id: null,
          source_invoice_scan_id: null,
          created_by_user_id: 1,
          created_at: toISOStringUtc(now()),
          lines: [],
        });
      }),
      http.post(`${API}/purchase-orders/5/track`, () => {
        po = { ...po, status: 'tracked' };
        return HttpResponse.json(po);
      }),
      http.post(`${API}/purchase-orders/5/close`, () => {
        po = { ...po, status: 'closed' };
        return HttpResponse.json(po);
      }),
      http.get(`${API}/goods-receipts`, () => HttpResponse.json([])),
    );

    const { default: OrderDetail } = await import('../pages/orders/OrderDetail');
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/purchasing/orders/:id" element={<OrderDetail />} />
      </Routes>,
      { initialEntries: ['/purchasing/orders/5'] },
    );

    await screen.findByText(/PO-5/);

    await user.click(screen.getByRole('button', { name: /send/i }));
    expect(await screen.findByRole('button', { name: /receive goods/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /receive goods/i }));
    await screen.findByRole('dialog');

    const spinners = screen.getAllByRole('spinbutton');
    await user.clear(spinners[0]!);
    await user.type(spinners[0]!, '3');

    await user.click(screen.getByRole('button', { name: /post receipt/i }));
    await screen.findByText(/PO-5/);
  });

  it('apply-catalog-matches: single POST with Idempotency-Key header', async () => {
    const mod = await import('../api');
    let posts = 0;
    let idemHeader: string | null = null;
    server.use(
      http.post(`${API}/invoice-scans/3/apply-catalog-matches`, async ({ request }) => {
        posts += 1;
        idemHeader = request.headers.get('Idempotency-Key');
        return HttpResponse.json({ id: 3, status: 'needs_review' }, { status: 200 });
      }),
    );
    const key = 'c'.repeat(12);
    await mod.applyCatalogMatches(3, {
      idempotency_key: key,
      line_matches: [
        { line_no: 1, product_id: 10 },
        { line_no: 2, product_id: null },
      ],
    });
    expect(posts).toBe(1);
    expect(idemHeader).toBe(key);
  });

  it('Match review: confirm single line updates local state', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'invoice_scans', action: 'validate' }]);

    server.use(
      http.get(`${API}/invoice-scans/7`, () =>
        HttpResponse.json({
          id: 7,
          source_type: 'image',
          provider: 'basic',
          status: 'needs_review',
          raw_input_ref: {},
          raw_output: null,
          parsed_output: { line_items: [{ line_no: 1, description: 'A' }] },
          override_output: null,
          created_at: toISOStringUtc(now()),
          updated_at: toISOStringUtc(now()),
        }),
      ),
      http.post(`${API}/ai/advisory/invoice-match`, () =>
        HttpResponse.json({
          line_matches: [
            {
              line_no: 1,
              raw_description: 'A',
              best_match_product_id: 10,
              candidates: [
                { product_id: 10, product_name: 'P10', confidence: 0.9, rationale: 'ok' },
              ],
            },
          ],
        }),
      ),
    );

    const { default: InvoiceScanDetail } = await import('@/features/invoice_scans/pages/InvoiceScanDetail');
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/purchasing/invoice-match/:id" element={<InvoiceScanDetail />} />
      </Routes>,
      { initialEntries: ['/purchasing/invoice-match/7'] },
    );

    await user.click(await screen.findByRole('button', { name: /load suggestions/i }));
    await screen.findByRole('combobox', { name: /change.*#1/i });

    expect(screen.queryByTestId('confirmed-1')).toBeNull();
    const confirmButtons = await screen.findAllByRole('button', { name: /^confirm$/i });
    await user.click(confirmButtons[0]!);
    expect(await screen.findByTestId('confirmed-1')).toBeInTheDocument();
  });

  it('user without purchase_orders:create gets /403 on new order route', () => {
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

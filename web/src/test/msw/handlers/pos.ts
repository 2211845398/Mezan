import { http, HttpResponse } from 'msw';

const BASE = '/api/v1';

const shiftRead = {
  id: 501,
  terminal_id: 10,
  branch_id: 1,
  status: 'open',
  opening_float: '100.00',
  expected_cash: '100.00',
  declared_cash: null,
  variance: null,
  opened_at: '2026-04-22T10:00:00Z',
};

let currentShift: typeof shiftRead | null = null;

function emptyCart(id: number, terminalId: number, shiftId: number) {
  return {
    id,
    terminal_id: terminalId,
    branch_id: 1,
    shift_id: shiftId,
    customer_id: null,
    status: 'active',
    subtotal: '0',
    discount_total: '0',
    tax_total: '0',
    total: '0',
    lines: [] as unknown[],
    discounts: [] as unknown[],
  };
}

let cart = emptyCart(900, 10, 501);
let paymentIntentId = 7000;
const capturedKeys = new Set<string>();

export const posHandlers = [
  http.get(`${BASE}/customers/:customerId`, ({ params }) => {
    const id = Number(params.customerId);
    return HttpResponse.json({
      id,
      phone: '0500000000',
      first_name: 'MSW',
      father_name: null,
      family_name: 'Customer',
      email: null,
      is_temporary: false,
      is_active: true,
      account_status: 'active',
      default_currency_id: 1,
      receivables_account_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      loyalty_balance: id === 42 ? 500 : 12,
      lifetime_spend: '0.00',
    });
  }),

  http.get(`${BASE}/terminals`, () =>
    HttpResponse.json([
      {
        id: 10,
        branch_id: 1,
        name: 'POS-1',
        terminal_code: 'T1',
        is_authorized: true,
        last_seen_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]),
  ),

  http.get(`${BASE}/pos/shifts/current`, () => HttpResponse.json(currentShift)),

  http.post(`${BASE}/pos/shifts/open`, async ({ request }) => {
    const body = (await request.json()) as { terminal_id: number; opening_float: string };
    currentShift = {
      ...shiftRead,
      terminal_id: body.terminal_id,
      opening_float: String(body.opening_float),
      expected_cash: String(body.opening_float),
    };
    return HttpResponse.json(currentShift, { status: 201 });
  }),

  http.post(`${BASE}/pos/shifts/:shiftId/close`, () => {
    currentShift = null;
    return HttpResponse.json(shiftRead);
  }),

  http.post(`${BASE}/pos/carts`, async ({ request }) => {
    const body = (await request.json()) as { terminal_id: number; shift_id: number };
    cart = emptyCart(901, body.terminal_id, body.shift_id);
    return HttpResponse.json(cart);
  }),

  http.get(`${BASE}/pos/carts/:cartId`, ({ params }) => {
    if (Number(params.cartId) !== cart.id) {
      return HttpResponse.json({ message: 'not found' }, { status: 404 });
    }
    return HttpResponse.json(cart);
  }),

  http.patch(`${BASE}/pos/carts/:cartId`, async ({ params, request }) => {
    const body = (await request.json()) as { customer_id?: number | null };
    if (Number(params.cartId) !== cart.id) {
      return HttpResponse.json({ detail: 'not found' }, { status: 404 });
    }
    if (body.customer_id === 999) {
      return HttpResponse.json(
        {
          message: 'Customer is not active for POS operations',
          details: { code: 'customer_inactive_pos' },
        },
        { status: 422 },
      );
    }
    cart = { ...cart, customer_id: body.customer_id ?? null };
    return HttpResponse.json(cart);
  }),

  http.post(`${BASE}/pos/carts/:cartId/lines`, async ({ params, request }) => {
    const body = (await request.json()) as { product_id: number; qty: number };
    if (Number(params.cartId) !== cart.id) {
      return HttpResponse.json({ message: 'not found' }, { status: 404 });
    }
    const line = {
      id: body.product_id,
      product_id: body.product_id,
      product_name: `Product ${body.product_id}`,
      product_sku: `SKU-${body.product_id}`,
      barcode: null,
      qty: body.qty,
      unit_price: '10.00',
      line_total: (10 * body.qty).toFixed(2),
      tax_rate: '0',
      line_tax_amount: '0',
    };
    cart = {
      ...cart,
      lines: [line],
      subtotal: line.line_total,
      total: line.line_total,
    };
    return HttpResponse.json(cart);
  }),

  http.post(`${BASE}/pos/carts/:cartId/discounts`, async ({ params, request }) => {
    const body = (await request.json()) as {
      mode?: string;
      code?: string | null;
      loyalty_points?: number | null;
    };
    if (Number(params.cartId) !== cart.id) {
      return HttpResponse.json({ message: 'not found' }, { status: 404 });
    }
    const mode = body.mode ?? (body.loyalty_points != null ? 'loyalty' : 'code');
    const sub = Number.parseFloat(String(cart.subtotal));

    if (mode === 'loyalty') {
      const pts = Number(body.loyalty_points);
      if (!cart.customer_id) {
        return HttpResponse.json({ message: 'Loyalty discount requires a customer on the cart' }, { status: 422 });
      }
      if (!Number.isFinite(pts) || pts < 1) {
        return HttpResponse.json({ message: 'Invalid loyalty points' }, { status: 422 });
      }
      const discAmt = Math.min(sub, pts * 0.01);
      const line = {
        id: 9901,
        code: '__POS_LOYALTY__',
        amount: discAmt.toFixed(2),
        loyalty_points_redeemed: pts,
        created_at: '2026-04-22T10:00:00Z',
      };
      cart = {
        ...cart,
        discounts: [line],
        discount_total: discAmt.toFixed(2),
        total: (sub - discAmt).toFixed(2),
      };
      return HttpResponse.json(cart);
    }

    const disc = Math.min(10, sub * 0.1);
    cart = {
      ...cart,
      discount_total: disc.toFixed(2),
      total: (sub - disc).toFixed(2),
    };
    return HttpResponse.json(cart);
  }),

  http.post(`${BASE}/pos/carts/:cartId/state`, async ({ params, request }) => {
    const body = (await request.json()) as { action: string };
    if (Number(params.cartId) !== cart.id) {
      return HttpResponse.json({ message: 'not found' }, { status: 404 });
    }
    if (body.action === 'lock') {
      const hasLine =
        Array.isArray(cart.lines) && cart.lines.some((ln: { qty?: number }) => (ln?.qty ?? 0) > 0);
      if (!hasLine) {
        return HttpResponse.json({ message: 'Cannot lock empty cart' }, { status: 422 });
      }
      cart = { ...cart, status: 'checkout_locked' };
    }
    if (body.action === 'park') {
      const hasLine =
        Array.isArray(cart.lines) && cart.lines.some((ln: { qty?: number }) => (ln?.qty ?? 0) > 0);
      if (!hasLine) {
        return HttpResponse.json({ message: 'Cannot park empty cart' }, { status: 422 });
      }
      cart = { ...cart, status: 'parked' };
    }
    if (body.action === 'resume') cart = { ...cart, status: 'active' };
    if (body.action === 'cancel') {
      if (cart.status === 'checkout_locked') {
        cart = { ...cart, status: 'active' };
      } else {
        cart = { ...cart, status: 'cancelled' };
      }
    }
    return HttpResponse.json(cart);
  }),

  http.post(`${BASE}/pos/payments/intents`, () => {
    paymentIntentId += 1;
    return HttpResponse.json(
      {
        id: paymentIntentId,
        cart_id: cart.id,
        provider: 'in_store',
        amount: cart.total,
        currency: 'USD',
        exchange_rate: '1',
        status: 'pending',
        external_id: 'ext',
      },
      { status: 201 },
    );
  }),

  http.post(`${BASE}/pos/payments/capture`, async ({ request }) => {
    const body = (await request.json()) as { idempotency_key: string };
    if (capturedKeys.has(body.idempotency_key)) {
      return HttpResponse.json(
        {
          id: paymentIntentId,
          cart_id: cart.id,
          provider: 'in_store',
          amount: cart.total,
          currency: 'USD',
          exchange_rate: '1',
          status: 'captured',
          external_id: 'ext',
        },
        { status: 200 },
      );
    }
    capturedKeys.add(body.idempotency_key);
    return HttpResponse.json({
      id: paymentIntentId,
      cart_id: cart.id,
      provider: 'in_store',
      amount: cart.total,
      currency: 'USD',
      exchange_rate: '1',
      status: 'captured',
      external_id: 'ext',
    });
  }),

  http.post(`${BASE}/pos/sales/finalize`, async ({ request }) => {
    const body = (await request.json()) as { idempotency_key: string };
    if (!capturedKeys.has(body.idempotency_key)) {
      return HttpResponse.json({ message: 'capture first' }, { status: 422 });
    }
    return HttpResponse.json({
      id: 555,
      invoice_number: 'INV-555',
      invoice_barcode: 'BC555',
      cart_id: cart.id,
      branch_id: 1,
      subtotal: cart.subtotal,
      discount_total: cart.discount_total,
      tax_total: cart.tax_total,
      total: cart.total,
      created_at: '2026-04-22T11:00:00Z',
      voided_at: null,
      void_reason: null,
    });
  }),

  http.get(`${BASE}/sales-invoices/register`, () =>
    HttpResponse.json({
      items: [
        {
          id: 555,
          invoice_number: 'INV-555',
          invoice_barcode: 'BC555',
          cart_id: cart.id,
          terminal_id: 10,
          branch_id: 1,
          customer_id: null,
          customer_display: null,
          subtotal: '10',
          discount_total: '0',
          tax_total: '0',
          total: '10',
          created_at: '2026-04-22T11:00:00Z',
        },
      ],
      total_count: 1,
      sum_subtotal: '10',
      sum_total: '10',
    }),
  ),

  http.get(`${BASE}/sales-invoices`, () =>
    HttpResponse.json([
      {
        id: 555,
        invoice_number: 'INV-555',
        invoice_barcode: 'BC555',
        cart_id: cart.id,
        terminal_id: 10,
        branch_id: 1,
        customer_id: null,
        customer_display: null,
        subtotal: '10',
        discount_total: '0',
        tax_total: '0',
        total: '10',
        created_at: '2026-04-22T11:00:00Z',
      },
    ]),
  ),

  http.get(`${BASE}/sales-invoices/:invoiceId`, ({ params }) =>
    HttpResponse.json({
      id: Number(params.invoiceId),
      invoice_number: 'INV-555',
      invoice_barcode: 'BC555',
      cart_id: cart.id,
      terminal_id: 10,
      branch_id: 1,
      customer_id: null,
      subtotal: '10',
      discount_total: '0',
      tax_total: '0',
      total: '10',
      created_at: '2026-04-22T11:00:00Z',
      voided_at: null,
      void_reason: null,
      lines: [
        {
          id: 1,
          product_id: 42,
          product_name: 'Product 42',
          product_sku: 'SKU-42',
          barcode: null,
          qty: 1,
          unit_price: '10',
          line_total: '10',
          tax_rate: '0',
          line_tax_amount: '0',
        },
      ],
      payments: [{ method: 'cash', amount: '10', reference: null, currency: 'USD' }],
    }),
  ),

  http.get(`${BASE}/pos/returns/invoice-lookup`, ({ request }) => {
    const ref = new URL(request.url).searchParams.get('invoice_barcode')?.trim() ?? '';
    if (ref !== 'INV-555' && ref !== 'BC555') {
      return HttpResponse.json({ detail: 'Invoice not found' }, { status: 404 });
    }
    return HttpResponse.json({
      invoice_id: 555,
      invoice_number: 'INV-555',
      invoice_barcode: 'BC555',
      branch_id: 1,
      lines: [
        {
          sales_invoice_line_id: 1,
          product_id: 42,
          variant_id: 1,
          product_name: 'Product 42',
          product_sku: 'SKU-42',
          unit_price: '10.00',
          qty_sold: 1,
          qty_already_returned: 0,
          qty_remaining: 1,
        },
      ],
    });
  }),

  http.post(`${BASE}/pos/returns`, () =>
    HttpResponse.json({
      sales_return_id: 99,
      credit_note_id: 88,
      credit_number: 'CN-88',
      total_amount: '10.00',
    }),
  ),
];

export function resetPosFixtures() {
  currentShift = null;
  cart = emptyCart(900, 10, 501);
  paymentIntentId = 7000;
  capturedKeys.clear();
}

/** Pre-open shift for register / tender tests (terminal 10 / branch 1). */
export function seedOpenShift() {
  currentShift = { ...shiftRead };
}

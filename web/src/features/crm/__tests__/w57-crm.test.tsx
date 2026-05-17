import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterEach,beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen } from '@/test/utils';

import CustomerDetail from '../pages/customers/CustomerDetail';
import ManualAdjustmentDrawer from '../pages/customers/ManualAdjustmentDrawer';
import DiscountsList from '../pages/discounts/DiscountsList';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

describe('W-5.7 CRM', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    server.resetHandlers();
    useAuthStore.getState().clear();
  });

  it('customer detail: loyalty ledger tab shows rows from MSW', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([
      { resource: 'customers', action: 'read' },
      { resource: 'loyalty', action: 'read' },
    ]);
    server.use(
      http.get(`${API}/customers/1`, () =>
        HttpResponse.json({
          id: 1,
          phone: '+100',
          first_name: 'A',
          father_name: null,
          family_name: null,
          email: null,
          is_temporary: false,
          default_currency_id: null,
          receivables_account_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          loyalty_balance: 10,
          lifetime_spend: '0',
        }),
      ),
      http.get(`${API}/customers/1/sales-invoices`, () =>
        HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0 }),
      ),
      http.get(`${API}/loyalty/customers/1/ledger`, () =>
        HttpResponse.json([
          {
            id: 1,
            customer_id: 1,
            entry_type: 'credit',
            points: 10,
            balance_after: 10,
            reason_code: 'purchase',
            reference_id: null,
            note: null,
            auditor_id: null,
            rule_id: null,
            created_at: '2024-01-02T00:00:00Z',
          },
        ]),
      ),
    );
    const u = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/crm/customers/:id" element={<CustomerDetail />} />
      </Routes>,
      { initialEntries: ['/crm/customers/1'] },
    );
    expect(await screen.findByRole('heading', { name: /customer/i })).toBeInTheDocument();
    expect(await screen.findByText('A · +100')).toBeInTheDocument();
    await u.click(await screen.findByRole('tab', { name: /loyalty ledger/i }));
    expect(await screen.findByText('purchase', {}, { timeout: 5000 })).toBeVisible();
  });

  it('manual adjustment: submit disabled when note empty or points zero', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'loyalty', action: 'adjust' }]);
    const u = userEvent.setup();
    renderWithProviders(<ManualAdjustmentDrawer open onOpenChange={() => {}} customerId={1} />);
    const submit = screen.getByRole('button', { name: /post adjustment/i });
    expect(submit).toBeDisabled();
    await u.type(screen.getByLabelText(/reason/i), 'Bonus');
    await u.clear(screen.getByLabelText(/points/i));
    await u.type(screen.getByLabelText(/^points$/i), '0');
    expect(submit).toBeDisabled();
  });

  it('discounts list: sorted by start_date desc then code', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([
      { resource: 'discounts', action: 'read' },
      { resource: 'discounts', action: 'update' },
    ]);
    const early = '2020-01-01T00:00:00Z';
    const late = '2025-01-01T00:00:00Z';
    server.use(
      http.get(`${API}/discounts`, () =>
        HttpResponse.json([
          {
            id: 1,
            name: 'A',
            code: 'A',
            discount_type: 'percentage',
            value: '10',
            min_order_amount: null,
            max_discount_amount: null,
            target_product_ids: null,
            buy_qty: null,
            get_qty: null,
            status: 'active',
            start_date: early,
            end_date: null,
            usage_limit: null,
            usage_count: 0,
            stackable: false,
            created_by_user_id: null,
            created_at: early,
            updated_at: early,
          },
          {
            id: 2,
            name: 'B',
            code: 'B',
            discount_type: 'percentage',
            value: '5',
            min_order_amount: null,
            max_discount_amount: null,
            target_product_ids: null,
            buy_qty: null,
            get_qty: null,
            status: 'active',
            start_date: late,
            end_date: null,
            usage_limit: null,
            usage_count: 0,
            stackable: false,
            created_by_user_id: null,
            created_at: late,
            updated_at: late,
          },
        ]),
      ),
    );
    renderWithProviders(<DiscountsList />);
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('B');
    expect(rows[2]).toHaveTextContent('A');
  });
});

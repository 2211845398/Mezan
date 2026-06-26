import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

import SupplierStatement from '../SupplierStatement';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

const statementPayload = {
  supplier_id: 7,
  date_from: '2025-01-01',
  date_to: '2025-12-31',
  opening_balance: '0.00',
  closing_balance: '100.00',
  total_purchases: '100.00',
  total_paid: '0.00',
  balance_due: '100.00',
  currency_code: 'USD',
  lines: [
    {
      entry_date: '2025-06-01',
      reference: 'GR-1',
      description: 'Goods receipt 1',
      debit: '0.00',
      credit: '100.00',
      running_balance: '100.00',
      source_type: 'goods_receipt',
      source_id: '1',
      journal_entry_id: 50,
      purchase_order_id: 9,
      open_item_id: 12,
      amount_total: '100.00',
      amount_paid: '0.00',
      amount_open: '100.00',
    },
  ],
};

describe('SupplierStatement', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useAuthStore.setState({
      status: 'authenticated',
      permissions: new Set(['suppliers:read', 'accounting:update']),
      permissionsLoaded: true,
    });
    server.use(
      http.get(`${API}/branches`, () => HttpResponse.json([])),
      http.get(`${API}/suppliers/7/statement`, () => HttpResponse.json(statementPayload)),
    );
  });

  afterEach(() => {
    server.resetHandlers();
    useAuthStore.getState().clear();
  });

  it('shows period KPIs from statement response', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/purchasing/suppliers/:id/statement" element={<SupplierStatement />} />
      </Routes>,
      { initialEntries: ['/purchasing/suppliers/7/statement'] },
    );

    expect(await screen.findByText('Balance due to supplier')).toBeInTheDocument();
    expect(screen.getByText('Total purchases (period)')).toBeInTheDocument();
    expect(screen.getByText('Total paid (period)')).toBeInTheDocument();
  });

  it('opens line drawer with payment action on row click', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/purchasing/suppliers/:id/statement" element={<SupplierStatement />} />
      </Routes>,
      { initialEntries: ['/purchasing/suppliers/7/statement'] },
    );

    const row = await screen.findByText('GR-1');
    await userEvent.click(row);

    expect(await screen.findByText('Line details')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Purchase order' })).toHaveAttribute(
      'href',
      '/purchasing/orders/9',
    );
    expect(screen.getByRole('button', { name: 'Apply payment voucher' })).toBeInTheDocument();
  });

  it('opens payment drawer from line detail', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/purchasing/suppliers/:id/statement" element={<SupplierStatement />} />
      </Routes>,
      { initialEntries: ['/purchasing/suppliers/7/statement'] },
    );

    await userEvent.click(await screen.findByText('GR-1'));
    await userEvent.click(await screen.findByRole('button', { name: 'Apply payment voucher' }));

    await waitFor(() => {
      expect(screen.getByText('Apply AP payment')).toBeInTheDocument();
    });
  });
});

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

import ArApplyPaymentDrawer from '../pages/ar/ArApplyPaymentDrawer';
import JournalList from '../pages/journal/JournalList';
import ReversalForm from '../pages/journal/ReversalForm';
import TrialBalance from '../pages/trial-balance/TrialBalance';

import type { OpenItemRead } from '../api';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

const journalDetail = {
  id: 1,
  entry_date: '2024-01-10',
  description: 'Test entry',
  source_type: 'sales',
  source_id: '99',
  reverses_entry_id: null,
  reversed_by_entry_id: null,
  lines: [
    {
      line_no: 1,
      account_id: 10,
      code: '1000',
      name: 'Cash',
      account_type: 'asset',
      branch_id: 1,
      debit: '50.00',
      credit: '0',
      memo: null,
    },
    {
      line_no: 2,
      account_id: 20,
      code: '4000',
      name: 'Revenue',
      account_type: 'revenue',
      branch_id: 1,
      debit: '0',
      credit: '50.00',
      memo: null,
    },
  ],
};

const sampleItem: OpenItemRead = {
  id: 1,
  branch_id: 1,
  source_type: 'invoice',
  source_id: 'INV-1',
  document_date: '2024-01-01',
  due_date: '2024-02-01',
  currency_code: 'SAR',
  amount_total: '100.00',
  amount_open: '100.00',
  status: 'open',
  days_overdue: 0,
  description: 'Test',
  customer_id: 1,
  supplier_id: null,
};

describe('W-5.6 accounting', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    useAuthStore.getState().clear();
  });

  it('reversal: POST 422 on closed period shows error toast', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'accounting', action: 'create' }]);
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'x');

    server.use(
      http.get(`${API}/accounting/journal-entries/1`, () => HttpResponse.json(journalDetail)),
      http.post(`${API}/accounting/journal-entries/1/reverse`, () =>
        HttpResponse.json({ detail: 'Fiscal period is closed' }, { status: 422 }),
      ),
    );

    const u = userEvent.setup();
    const { unmount } = renderWithProviders(
      <Routes>
        <Route path="/accounting/journal/:id/reverse" element={<ReversalForm />} />
      </Routes>,
      { initialEntries: ['/accounting/journal/1/reverse'] },
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /reverse journal #1/i })).toBeInTheDocument();
    });

    await u.click(screen.getByRole('button', { name: /create reversal/i }));
    expect(errorSpy).toHaveBeenCalled();
    unmount();
    errorSpy.mockRestore();
  });

  it('AR apply: submit disabled when total allocation exceeds tendered', async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <ArApplyPaymentDrawer open onOpenChange={() => {}} items={[sampleItem]} />,
    );

    const textboxes = screen.getAllByRole('textbox');
    const tendered = textboxes[0]!;
    const alloc = textboxes[1]!;
    await u.clear(tendered);
    await u.type(tendered, '10.00');
    await u.clear(alloc);
    await u.type(alloc, '25.00');

    expect(screen.getByRole('button', { name: /submit applications/i })).toBeDisabled();
  });

  it('trial balance: shows balanced debit and credit from MSW', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'accounting', action: 'read' }]);

    server.use(
      http.get(`${API}/branches`, () => HttpResponse.json([{ id: 1, name: 'Main', is_archived: false }])),
      http.get(`${API}/accounting/trial-balance`, () =>
        HttpResponse.json([
          {
            account_id: 1,
            code: '1000',
            name: 'A',
            account_type: 'asset',
            total_debit: '40.00',
            total_credit: '0',
            net: '40.00',
          },
          {
            account_id: 2,
            code: '2000',
            name: 'B',
            account_type: 'revenue',
            total_debit: '0',
            total_credit: '40.00',
            net: '-40.00',
          },
        ]),
      ),
    );

    const { unmount } = renderWithProviders(
      <Routes>
        <Route path="/accounting/trial-balance" element={<TrialBalance />} />
      </Routes>,
      { initialEntries: ['/accounting/trial-balance'] },
    );

    await waitFor(() => {
      expect(
        screen.getByText('Total debit: 40.00 · Total credit: 40.00', { exact: true }),
      ).toBeInTheDocument();
    });
    unmount();
  });

  it('journal list: read-only user does not see new manual entry', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'accounting', action: 'read' }]);
    server.use(
      http.get(`${API}/branches`, () => HttpResponse.json([{ id: 1, name: 'Main', is_archived: false }])),
      http.get(`${API}/accounting/journal-entries`, () =>
        HttpResponse.json({ items: [], total: 0, limit: 30, offset: 0 }),
      ),
    );

    const { unmount } = renderWithProviders(
      <Routes>
        <Route path="/accounting/journal" element={<JournalList />} />
      </Routes>,
      { initialEntries: ['/accounting/journal'] },
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /journal entries/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /new journal entry/i })).not.toBeInTheDocument();
    unmount();
  });
});

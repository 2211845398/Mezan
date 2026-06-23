import { beforeEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import ExecutiveBiDashboardContent from '@/features/bi/pages/ExecutiveBiDashboardContent';
import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

function seedExecutiveAuth() {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    refreshToken: null,
    user: { id: 1, email: 'admin@example.com', branch_id: 1 } as never,
    permissions: new Set<string>(),
    roleCodes: ['OWNER'],
  });
  useAuthStore.getState().setPermissions([
    { resource: 'analytics', action: 'read' },
    { resource: 'catalog', action: 'read' },
    { resource: 'purchase_orders', action: 'read' },
    { resource: 'sales_invoices', action: 'read' },
    { resource: 'accounting', action: 'read' },
  ]);
}

describe('ExecutiveBiDashboardContent', () => {
  beforeEach(() => {
    seedExecutiveAuth();
  });

  it('renders searchable branch combobox in filters', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/dashboard" element={<ExecutiveBiDashboardContent />} />
      </Routes>,
      { initialEntries: ['/dashboard'] },
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('bi:tables.top_products_title'))).toBeInTheDocument();
    });

    expect(screen.getByRole('combobox', { name: i18n.t('bi:filters.branch') })).toBeInTheDocument();
  });

  it('navigates to product detail when clicking a top product row', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/dashboard" element={<ExecutiveBiDashboardContent />} />
        <Route path="/catalog/products/:productId" element={<div>Product detail</div>} />
      </Routes>,
      { initialEntries: ['/dashboard'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg Bag')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Rice 5kg Bag'));

    expect(await screen.findByText('Product detail')).toBeInTheDocument();
  });

  it('navigates to purchase order detail when clicking a recent PO row', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/dashboard" element={<ExecutiveBiDashboardContent />} />
        <Route path="/purchasing/orders/:id" element={<div>Order detail</div>} />
      </Routes>,
      { initialEntries: ['/dashboard'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Fresh Foods Ltd')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Fresh Foods Ltd'));

    expect(await screen.findByText('Order detail')).toBeInTheDocument();
  });

  it('links category mix card to catalog categories', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/dashboard" element={<ExecutiveBiDashboardContent />} />
      </Routes>,
      { initialEntries: ['/dashboard'] },
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('bi:charts.category_mix'))).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: i18n.t('bi:charts.mix_view_catalog') });
    expect(link).toHaveAttribute('href', '/catalog/categories');
  });
});

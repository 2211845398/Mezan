import { beforeEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { CategoryRevenueTab } from '@/features/catalog/pages/categories/CategoryRevenueTab';
import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

function seedAuth() {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    refreshToken: null,
    user: { id: 1, email: 'admin@example.com', branch_id: 1 } as never,
    permissions: new Set<string>(),
    roleCodes: ['OWNER'],
    activeBranchId: 1,
  });
  useAuthStore.getState().setPermissions([
    { resource: 'analytics', action: 'read' },
    { resource: 'catalog', action: 'read' },
  ]);
}

describe('CategoryRevenueTab', () => {
  beforeEach(() => {
    seedAuth();
  });

  it('loads revenue breakdown and shows category and product tables', async () => {
    renderWithProviders(<CategoryRevenueTab categoryId={1} />);

    await waitFor(() => {
      expect(screen.getByText(i18n.t('catalog:categories.revenue_categories_title'))).toBeInTheDocument();
    });

    expect(screen.getByText('Beverages')).toBeInTheDocument();
    expect(screen.getByText('Soft drinks')).toBeInTheDocument();
    expect(screen.getByText('Rice 5kg Bag')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: i18n.t('bi:filters.branch') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('bi:filters.apply') })).toBeInTheDocument();
  });

  it('navigates to subcategory detail when clicking a category row', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/catalog/categories/:categoryId" element={<CategoryRevenueTab categoryId={1} />} />
        <Route path="/catalog/categories/2" element={<div>Child category detail</div>} />
      </Routes>,
      { initialEntries: ['/catalog/categories/1'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Soft drinks')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Soft drinks'));

    expect(await screen.findByText('Child category detail')).toBeInTheDocument();
  });

  it('navigates to product detail when clicking a product row', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/catalog/categories/:categoryId" element={<CategoryRevenueTab categoryId={1} />} />
        <Route path="/catalog/products/:productId" element={<div>Product detail</div>} />
      </Routes>,
      { initialEntries: ['/catalog/categories/1'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg Bag')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Rice 5kg Bag'));

    expect(await screen.findByText('Product detail')).toBeInTheDocument();
  });
});

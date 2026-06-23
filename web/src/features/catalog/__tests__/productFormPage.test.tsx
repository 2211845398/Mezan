import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';

import ProductsList from '@/features/catalog/pages/products/ProductsList';
import ProductFormPage from '@/features/catalog/pages/products/ProductFormPage';
import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { MOCK_PRODUCT } from '@/test/msw/handlers/products';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

const BASE = '/api/v1';

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
    { resource: 'catalog', action: 'read' },
    { resource: 'catalog', action: 'update' },
  ]);
}

describe('ProductsList search placeholder', () => {
  beforeEach(() => {
    seedAuth();
  });

  it('shows product search placeholder', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/catalog/products" element={<ProductsList />} />
      </Routes>,
      { initialEntries: ['/catalog/products'] },
    );

    expect(
      screen.getByPlaceholderText(i18n.t('catalog:products.filter.search_ph')),
    ).toBeInTheDocument();
  });
});

describe('ProductFormPage', () => {
  beforeEach(() => {
    seedAuth();
  });

  it('shows name as readonly in view mode with header action order', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/catalog/products/:productId" element={<ProductFormPage />} />
      </Routes>,
      { initialEntries: ['/catalog/products/10'] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Summer Polo Shirt')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Summer Polo Shirt')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: i18n.t('common:actions.edit') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: i18n.t('catalog:products.title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('catalog:products.archive') })).toBeInTheDocument();
  });

  it('allows tab navigation in view mode', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/catalog/products/:productId" element={<ProductFormPage />} />
      </Routes>,
      { initialEntries: ['/catalog/products/10'] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Summer Polo Shirt')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: i18n.t('catalog:products.tabs.units') }));

    await waitFor(() => {
      expect(screen.getByText(i18n.t('catalog:products.units.base_unit'))).toBeInTheDocument();
    });
  });

  it('enables editing when Edit is clicked', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/catalog/products/:productId" element={<ProductFormPage />} />
      </Routes>,
      { initialEntries: ['/catalog/products/10'] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Summer Polo Shirt')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: i18n.t('common:actions.edit') }));

    expect(screen.getByDisplayValue('Summer Polo Shirt')).not.toHaveAttribute('readonly');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: i18n.t('common:actions.save') })).toBeInTheDocument();
    });
    const cancelBtn = screen.getByRole('button', { name: i18n.t('common:actions.cancel') });
    const saveBtn = screen.getByRole('button', { name: i18n.t('common:actions.save') });
    const productsLink = screen.getByRole('link', { name: i18n.t('catalog:products.title') });
    expect(cancelBtn.compareDocumentPosition(saveBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(saveBtn.compareDocumentPosition(productsLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not save when Edit is clicked', async () => {
    let patchCount = 0;
    server.use(
      http.patch(`${BASE}/products/:productId`, () => {
        patchCount += 1;
        return HttpResponse.json(MOCK_PRODUCT);
      }),
      http.post(`${BASE}/products/:productId/variants/sync`, () =>
        HttpResponse.json({ created: 0, updated: 0, deactivated: 0, variant_ids: [] }),
      ),
    );

    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/catalog/products/:productId" element={<ProductFormPage />} />
      </Routes>,
      { initialEntries: ['/catalog/products/10'] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Summer Polo Shirt')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: i18n.t('common:actions.edit') }));

    expect(patchCount).toBe(0);
    expect(screen.queryByText(i18n.t('catalog:products.save_ok'))).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Summer Polo Shirt')).not.toHaveAttribute('readonly');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import CategoryPropertiesPage from '@/features/catalog/pages/categories/CategoryPropertiesPage';
import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { resetMockCategoryState } from '@/test/msw/handlers/catalog';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

function seedAuth(withUpdate = true) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    refreshToken: null,
    user: { id: 1, email: 'admin@example.com', branch_id: 1 } as never,
    permissions: new Set<string>(),
    roleCodes: ['OWNER'],
    activeBranchId: 1,
  });
  const perms = [{ resource: 'catalog', action: 'read' }];
  if (withUpdate) {
    perms.push({ resource: 'catalog', action: 'update' });
  }
  useAuthStore.getState().setPermissions(perms);
}

describe('CategoryPropertiesPage', () => {
  beforeEach(() => {
    resetMockCategoryState();
    seedAuth();
  });

  it('shows overview in read-only mode with Edit action', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/catalog/categories/:categoryId" element={<CategoryPropertiesPage />} />
      </Routes>,
      { initialEntries: ['/catalog/categories/1'] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Beverages')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: i18n.t('common:actions.edit') })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('common:actions.save') })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Beverages')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('beverages')).toHaveAttribute('readonly');
  });

  it('enters edit mode with parent combobox and save/cancel actions', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/catalog/categories/:categoryId" element={<CategoryPropertiesPage />} />
      </Routes>,
      { initialEntries: ['/catalog/categories/1'] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Beverages')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: i18n.t('common:actions.edit') }));

    expect(screen.getByRole('button', { name: i18n.t('common:actions.save') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('common:actions.cancel') })).toBeInTheDocument();
    expect(screen.getByText(i18n.t('catalog:categories.parent_none'))).toBeInTheDocument();
    expect(screen.getByDisplayValue('Beverages')).not.toHaveAttribute('readonly');
    const slugInput = screen.getByDisplayValue('beverages');
    expect(slugInput).not.toHaveAttribute('readonly');
    expect(slugInput).toHaveAttribute('dir', 'rtl');
  });

  it('cancel restores original field values', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/catalog/categories/:categoryId" element={<CategoryPropertiesPage />} />
      </Routes>,
      { initialEntries: ['/catalog/categories/1'] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Beverages')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: i18n.t('common:actions.edit') }));
    const nameInput = screen.getByDisplayValue('Beverages');
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed name');
    await user.click(screen.getByRole('button', { name: i18n.t('common:actions.cancel') }));

    expect(screen.getByDisplayValue('Beverages')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Changed name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('common:actions.edit') })).toBeInTheDocument();
  });

  it('hides edit action without catalog.update permission', async () => {
    seedAuth(false);

    renderWithProviders(
      <Routes>
        <Route path="/catalog/categories/:categoryId" element={<CategoryPropertiesPage />} />
      </Routes>,
      { initialEntries: ['/catalog/categories/1'] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Beverages')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: i18n.t('common:actions.edit') })).not.toBeInTheDocument();
  });
});

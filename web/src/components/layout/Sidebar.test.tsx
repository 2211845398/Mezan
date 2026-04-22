import { beforeEach, describe, expect, it } from 'vitest';

import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { renderWithProviders, screen } from '@/test/utils';

/*
 * RBAC-driven sidebar trimming. A cashier (POS + catalog:read) must see the
 * POS entry and the catalog products link, and must NOT see Admin or the
 * dashboard (which requires `bi:read`).
 */

describe('Sidebar RBAC trimming', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'test',
      refreshToken: null,
      user: null,
      permissions: new Set<string>(),
      activeBranchId: null,
    });
  });

  it('shows items the cashier has permission for and hides Admin', () => {
    useAuthStore.getState().setPermissions([
      { resource: 'pos_carts', action: 'create' },
      { resource: 'catalog', action: 'read' },
    ]);

    renderWithProviders(<Sidebar />);

    // Visible: POS + Catalog group.
    expect(screen.getByText('نقطة البيع')).toBeInTheDocument();
    expect(screen.getByText('الكتالوج')).toBeInTheDocument();

    // Hidden: Dashboard (needs bi:read), Admin (needs users:read etc.),
    // Accounting (needs accounting:read).
    expect(screen.queryByText('لوحة التحكم')).toBeNull();
    expect(screen.queryByText('الإدارة')).toBeNull();
    expect(screen.queryByText('المحاسبة')).toBeNull();
  });

  it('shows everything a full-access admin can reach', () => {
    useAuthStore.getState().setPermissions([
      { resource: 'analytics', action: 'read' },
      { resource: 'users', action: 'read' },
      { resource: 'roles', action: 'read' },
      { resource: 'accounting', action: 'read' },
      { resource: 'pos_carts', action: 'create' },
    ]);

    renderWithProviders(<Sidebar />);

    expect(screen.getByText('لوحة التحكم')).toBeInTheDocument();
    expect(screen.getByText('الإدارة')).toBeInTheDocument();
    expect(screen.getByText('المحاسبة')).toBeInTheDocument();
    expect(screen.getByText('نقطة البيع')).toBeInTheDocument();
  });

  it('hides a parent group whose children are all gated and missing', () => {
    useAuthStore.getState().setPermissions([
      { resource: 'pos_carts', action: 'create' },
    ]);

    renderWithProviders(<Sidebar />);

    // Accounting group has no visible children for this user → hidden.
    expect(screen.queryByText('المحاسبة')).toBeNull();
    expect(screen.queryByText('الإدارة')).toBeNull();
  });
});

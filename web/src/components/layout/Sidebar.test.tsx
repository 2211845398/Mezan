import { beforeEach, describe, expect, it } from 'vitest';

import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { renderWithProviders, screen } from '@/test/utils';

/*
 * RBAC-driven sidebar trimming. A cashier (POS + catalog:read) must see the
 * POS entry, the catalog products link, and the Dashboard entry (always visible).
 * Admin-only groups stay hidden without the right permissions.
 */

describe('Sidebar RBAC trimming', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
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
      { resource: 'pos_shifts', action: 'read' },
      { resource: 'pos_carts', action: 'create' },
      { resource: 'catalog', action: 'read' },
    ]);

    renderWithProviders(<Sidebar />);

    expect(screen.getByText(i18n.t('nav.pos'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('nav.catalog'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('nav.dashboard'))).toBeInTheDocument();

    // Hidden: Admin (needs users:read etc.).
    expect(screen.queryByText(i18n.t('nav.admin'))).toBeNull();
    // Accounting group may show for catalog:read (taxes link); journal entries stay hidden.
    expect(screen.queryByText(i18n.t('nav.accounting_journal'))).toBeNull();
    expect(screen.queryByText(i18n.t('nav.accounting_trial_balance'))).toBeNull();
  });

  it('shows everything a full-access admin can reach', () => {
    useAuthStore.getState().setPermissions([
      { resource: 'analytics', action: 'read' },
      { resource: 'users', action: 'read' },
      { resource: 'roles', action: 'read' },
      { resource: 'accounting', action: 'read' },
      { resource: 'pos_shifts', action: 'read' },
      { resource: 'pos_carts', action: 'create' },
    ]);

    renderWithProviders(<Sidebar />);

    expect(screen.getByText(i18n.t('nav.dashboard'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('nav.admin'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('nav.accounting'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('nav.pos'))).toBeInTheDocument();
  });

  it('hides a parent group whose children are all gated and missing', () => {
    useAuthStore.getState().setPermissions([
      { resource: 'pos_carts', action: 'create' },
    ]);

    renderWithProviders(<Sidebar />);

    // Accounting group has no visible children for this user → hidden.
    expect(screen.queryByText(i18n.t('nav.accounting'))).toBeNull();
    expect(screen.queryByText(i18n.t('nav.admin'))).toBeNull();
  });
});

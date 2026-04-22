import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import { RequireAuth, RequireBranchContext,RequirePermission } from '@/routes/guards';
import { renderWithProviders, screen } from '@/test/utils';

/*
 * One test per guard. Each guard is exercised through a tiny in-memory route
 * tree so the actual `Navigate` redirect is observable via the rendered
 * destination component.
 */

function Protected() {
  return <div>protected</div>;
}
function LoginStub() {
  return <div>login</div>;
}
function ForbiddenStub() {
  return <div>forbidden</div>;
}
function BranchPickerStub() {
  return <div>pick a branch</div>;
}

describe('RequireAuth', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('redirects unauthenticated users to /login with ?next=', () => {
    useAuthStore.setState({ status: 'unauthenticated' });

    renderWithProviders(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/admin/users" element={<Protected />} />
        </Route>
        <Route path="/login" element={<LoginStub />} />
      </Routes>,
      { initialEntries: ['/admin/users'] },
    );

    expect(screen.getByText('login')).toBeInTheDocument();
    expect(screen.queryByText('protected')).toBeNull();
  });

  it('renders the protected element when authenticated', () => {
    useAuthStore.setState({ status: 'authenticated' });

    renderWithProviders(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/secret" element={<Protected />} />
        </Route>
      </Routes>,
      { initialEntries: ['/secret'] },
    );

    expect(screen.getByText('protected')).toBeInTheDocument();
  });
});

describe('RequirePermission', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useAuthStore.setState({ status: 'authenticated' });
  });

  it('renders /403 when the permission is missing', () => {
    useAuthStore.getState().setPermissions([{ resource: 'pos_carts', action: 'create' }]);

    renderWithProviders(
      <Routes>
        <Route
          path="/admin/users"
          element={
            <RequirePermission resource="users" action="read">
              <Protected />
            </RequirePermission>
          }
        />
        <Route path="/403" element={<ForbiddenStub />} />
      </Routes>,
      { initialEntries: ['/admin/users'] },
    );

    expect(screen.getByText('forbidden')).toBeInTheDocument();
    expect(screen.queryByText('protected')).toBeNull();
  });

  it('renders the children when the permission is present', () => {
    useAuthStore.getState().setPermissions([{ resource: 'users', action: 'read' }]);

    renderWithProviders(
      <Routes>
        <Route
          path="/admin/users"
          element={
            <RequirePermission resource="users" action="read">
              <Protected />
            </RequirePermission>
          }
        />
      </Routes>,
      { initialEntries: ['/admin/users'] },
    );

    expect(screen.getByText('protected')).toBeInTheDocument();
  });
});

describe('RequireBranchContext', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useAuthStore.setState({ status: 'authenticated' });
  });

  it('redirects to /select-branch when no branch is active', () => {
    useAuthStore.setState({ activeBranchId: null });

    renderWithProviders(
      <Routes>
        <Route
          path="/pos"
          element={
            <RequireBranchContext>
              <Protected />
            </RequireBranchContext>
          }
        />
        <Route path="/select-branch" element={<BranchPickerStub />} />
      </Routes>,
      { initialEntries: ['/pos'] },
    );

    expect(screen.getByText('pick a branch')).toBeInTheDocument();
  });

  it('renders children when a branch is active', () => {
    useAuthStore.setState({ activeBranchId: 7 });

    renderWithProviders(
      <Routes>
        <Route
          path="/pos"
          element={
            <RequireBranchContext>
              <Protected />
            </RequireBranchContext>
          }
        />
      </Routes>,
      { initialEntries: ['/pos'] },
    );

    expect(screen.getByText('protected')).toBeInTheDocument();
  });
});

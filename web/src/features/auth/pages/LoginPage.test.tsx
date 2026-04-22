import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import LoginPage from '@/features/auth/pages/LoginPage';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

function DashboardStub() {
  return <div>dashboard-stub</div>;
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useAuthStore.setState({ status: 'unauthenticated' });
  });

  it('logs in, stores tokens, and redirects to /dashboard', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardStub />} />
      </Routes>,
      { initialEntries: ['/login'] },
    );

    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'pw12345!');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => expect(screen.getByText('dashboard-stub')).toBeInTheDocument());

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access-token-1');
    expect(state.refreshToken).toBe('refresh-token-1');
    expect(state.user?.email).toBe('admin@example.com');
    expect(state.permissions.has('analytics:read')).toBe(true);
  });

  it('honours a sanitized ?next= redirect after success', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/users" element={<div>admin-users</div>} />
        <Route path="/dashboard" element={<DashboardStub />} />
      </Routes>,
      { initialEntries: ['/login?next=/admin/users'] },
    );

    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'pw12345!');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => expect(screen.getByText('admin-users')).toBeInTheDocument());
  });

  it('falls back to /dashboard when ?next= is off-site', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardStub />} />
      </Routes>,
      { initialEntries: ['/login?next=https://evil.example/phish'] },
    );

    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'pw12345!');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => expect(screen.getByText('dashboard-stub')).toBeInTheDocument());
  });
});

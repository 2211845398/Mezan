import { beforeEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import ProfilePage from '@/features/auth/pages/ProfilePage';
import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

describe('ProfilePage validation', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 't',
      refreshToken: null,
      user: { id: 1, email: 'admin@example.com' } as never,
      permissions: new Set<string>(),
      roleCodes: ['ADMIN'],
    });
  });

  it('uses noValidate on the personal info form', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>,
      { initialEntries: ['/profile'] },
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('auth:profile.personal_title'))).toBeInTheDocument();
    });

    const form = document.getElementById('auth-profile-form');
    expect(form).toHaveAttribute('noValidate');
  });

  it('shows Arabic email banner when submitting an invalid email', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>,
      { initialEntries: ['/profile'] },
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('auth:profile.personal_title'))).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: i18n.t('common:actions.edit') }));
    const emailInput = screen.getByLabelText(i18n.t('auth:profile.email'));
    await user.clear(emailInput);
    await user.type(emailInput, 'admin@gma');
    await user.click(screen.getByRole('button', { name: i18n.t('common:actions.save') }));

    await waitFor(() => {
      const form = document.getElementById('auth-profile-form');
      const banner = form?.querySelector('div[role="alert"]');
      expect(banner).toHaveTextContent(i18n.t('common:errors.validation_email_invalid'));
    });
  });
});

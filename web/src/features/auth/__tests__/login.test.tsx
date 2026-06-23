import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyLoginError } from '@/features/auth/pages/loginErrors';
import LoginPage from '@/features/auth/pages/LoginPage';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

/*
 * W-2 bug 1: login must map backend errors to the correct i18n key.
 *
 *   401          → auth:errors.invalid_credentials (inline on login form)
 *   403 inactive → auth:errors.account_inactive
 *   429          → auth:errors.rate_limited
 *   other        → auth:errors.unexpected
 */

describe('classifyLoginError', () => {
  it('maps 401 to invalid_credentials', () => {
    const err = {
      isAxiosError: true,
      response: { status: 401, data: {} },
    } as unknown;
    expect(classifyLoginError(err)).toBe('auth:errors.invalid_credentials');
  });

  it('maps 403 with "inactive" detail to account_inactive', () => {
    const err = {
      isAxiosError: true,
      response: {
        status: 403,
        data: { error: { message: 'user is inactive', details: {} } },
      },
    } as unknown;
    expect(classifyLoginError(err)).toBe('auth:errors.account_inactive');
  });

  it('maps 429 to rate_limited', () => {
    const err = {
      isAxiosError: true,
      response: { status: 429, data: {} },
    } as unknown;
    expect(classifyLoginError(err)).toBe('auth:errors.rate_limited');
  });

  it('falls back to unexpected for anything else', () => {
    const err = {
      isAxiosError: true,
      response: { status: 500, data: {} },
    } as unknown;
    expect(classifyLoginError(err)).toBe('auth:errors.unexpected');
  });

  it('falls back to unexpected for non-Axios errors', () => {
    expect(classifyLoginError(new Error('boom'))).toBe('auth:errors.unexpected');
  });
});

describe('LoginPage inline validation', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useAuthStore.setState({ status: 'unauthenticated' });
  });

  it('shows email required when submitting empty form', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { initialEntries: ['/login'] },
    );

    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(await screen.findByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();
  });

  it('shows invalid email message for malformed address', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { initialEntries: ['/login'] },
    );

    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'notanemail');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(await screen.findByText('البريد الإلكتروني غير صالح')).toBeInTheDocument();
  });

  it('shows password too short message', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { initialEntries: ['/login'] },
    );

    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(
      await screen.findByText('كلمة المرور يجب أن لا تقل عن 8 أحرف'),
    ).toBeInTheDocument();
  });

  it('clears field error when user starts typing', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { initialEntries: ['/login'] },
    );

    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
    expect(await screen.findByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'a');

    await waitFor(() => {
      expect(screen.queryByText('البريد الإلكتروني مطلوب')).not.toBeInTheDocument();
    });
  });
});

describe('LoginPage server errors', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useAuthStore.setState({ status: 'unauthenticated' });
  });

  it('shows inline invalid_credentials on a 401 from /auth/login', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json(
          {
            error: { code: 'not_authenticated', message: 'bad creds', details: {} },
          },
          { status: 401 },
        ),
      ),
    );
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id');

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { initialEntries: ['/login'] },
    );

    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(
      await screen.findByText('البريد الإلكتروني أو كلمة المرور غير صحيحة'),
    ).toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('shows the rate_limited toast on a 429', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json(
          { error: { code: 'rate_limited', message: 'slow down', details: {} } },
          { status: 429, headers: { 'Retry-After': '60' } },
        ),
      ),
    );
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    vi.spyOn(toast, 'warning').mockImplementation(() => 'id');

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { initialEntries: ['/login'] },
    );

    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    const messages = errorSpy.mock.calls.map((c) => c[0]);
    expect(messages).toContain('عدد المحاولات تجاوز الحد، حاول بعد قليل.');
  });
});

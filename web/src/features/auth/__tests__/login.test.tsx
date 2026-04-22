import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LoginPage, { classifyLoginError } from '@/features/auth/pages/LoginPage';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/utils';

/*
 * W-2 bug 1: login must map backend errors to the correct i18n key.
 *
 *   401          → auth:errors.invalid_credentials
 *   403 inactive → auth:errors.account_inactive
 *   429          → auth:errors.rate_limited
 *   other        → auth:errors.unexpected
 *
 * We spy on `sonner`'s `toast.error` to observe the surfaced key; bypassing
 * the on-screen renderer keeps the test fast and deterministic.
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

describe('LoginPage error toasts', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useAuthStore.setState({ status: 'unauthenticated' });
  });

  it('shows the invalid_credentials toast on a 401 from /auth/login', async () => {
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
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'wrongpw');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    const [message] = errorSpy.mock.calls[0] ?? [];
    // i18n renders the Arabic translation of the key at runtime.
    expect(message).toBe('بيانات الاعتماد غير صحيحة.');

    // The refresh interceptor must NOT have fired on /auth/login, so the
    // store stays empty — no phantom access token.
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
    // Silence the rate-limit interceptor's own warning toast so the error
    // spy sees our mapped message cleanly.
    vi.spyOn(toast, 'warning').mockImplementation(() => 'id');

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { initialEntries: ['/login'] },
    );

    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    const messages = errorSpy.mock.calls.map((c) => c[0]);
    expect(messages).toContain('عدد المحاولات تجاوز الحد، حاول بعد قليل.');
  });
});

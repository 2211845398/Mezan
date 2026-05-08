import { http,HttpResponse } from 'msw';

/*
 * Minimal MSW handlers for the auth endpoints consumed in W-2. The base URL
 * matches `VITE_API_BASE_URL` (`/api/v1`) so tests exercise the same paths
 * the browser uses at runtime.
 */

const BASE = '/api/v1';

type LoginBody = { email: string; password: string };
type RefreshBody = { refresh_token: string };

export const DEFAULT_USER = {
  id: 1,
  email: 'admin@example.com',
  full_name: 'Admin Al-Admin',
  status: 'active',
  branch_id: 1,
  phone: null,
  city: null,
  preferred_language: 'ar',
  avatar_url: null,
  last_login_at: '2026-04-22T08:00:00Z',
  employee_profile_id: null as number | null,
};

export const DEFAULT_ADMIN_PERMISSIONS = [
  { resource: 'analytics', action: 'read' },
  { resource: 'users', action: 'read' },
  { resource: 'accounting', action: 'read' },
  { resource: 'pos_carts', action: 'create' },
  { resource: 'inventory', action: 'read' },
];

export const CASHIER_PERMISSIONS = [
  { resource: 'pos_carts', action: 'create' },
  { resource: 'catalog', action: 'read' },
];

export const authHandlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as LoginBody;
    if (body.email === 'bad@example.com') {
      return HttpResponse.json(
        {
          error: { code: 'not_authenticated', message: 'Invalid credentials', details: {} },
          request_id: 'req-bad',
        },
        { status: 401 },
      );
    }
    return HttpResponse.json({
      access_token: 'access-token-1',
      refresh_token: 'refresh-token-1',
      token_type: 'bearer',
      expires_in: 3600,
      user_id: DEFAULT_USER.id,
      email: body.email,
    });
  }),

  http.post(`${BASE}/auth/refresh`, async ({ request }) => {
    const body = (await request.json()) as RefreshBody;
    if (body.refresh_token === 'bad-refresh') {
      return HttpResponse.json(
        {
          error: { code: 'not_authenticated', message: 'Refresh failed', details: {} },
        },
        { status: 401 },
      );
    }
    return HttpResponse.json({
      access_token: 'access-token-2',
      token_type: 'bearer',
      expires_in: 3600,
    });
  }),

  http.post(`${BASE}/auth/logout`, () => HttpResponse.json({ message: 'Logged out' })),

  http.get(`${BASE}/auth/me`, () => HttpResponse.json(DEFAULT_USER)),

  http.post(`${BASE}/auth/me/avatar`, () =>
    HttpResponse.json({
      ...DEFAULT_USER,
      avatar_url: '/api/v1/static/avatars/1.png',
    }),
  ),

  http.get(`${BASE}/auth/me/permissions`, () => HttpResponse.json(DEFAULT_ADMIN_PERMISSIONS)),

  http.get(`${BASE}/auth/me/roles`, () => HttpResponse.json({ codes: ['ADMIN'] })),

  http.get(`${BASE}/employees/me/schedules`, () => HttpResponse.json([])),

  http.get(`${BASE}/health`, () => HttpResponse.json({ status: 'healthy' })),
];

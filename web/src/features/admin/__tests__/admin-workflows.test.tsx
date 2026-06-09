import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import BackupsList from '@/features/admin/pages/backups/BackupsList';
import BranchesList from '@/features/admin/pages/branches/BranchesList';
import SendNow from '@/features/admin/pages/notifications/SendNow';
import RolesList from '@/features/admin/pages/roles/RolesList';
import UserCreate from '@/features/admin/pages/users/UserCreate';
import UsersList from '@/features/admin/pages/users/UsersList';
import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { server } from '@/test/msw/server';
import { renderWithProviders, userEvent } from '@/test/utils';

const BASE = '/api/v1';

describe('W-5.9 admin', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 't',
      refreshToken: null,
      user: { id: 1, email: 'a@a.com' } as never,
      permissions: new Set<string>(),
    });
    useAuthStore.getState().setPermissions([
      { resource: 'users', action: 'create' },
      { resource: 'users', action: 'read' },
      { resource: 'users', action: 'update' },
      { resource: 'roles', action: 'read' },
      { resource: 'branches', action: 'read' },
      { resource: 'branches', action: 'create' },
      { resource: 'branches', action: 'update' },
      { resource: 'branches', action: 'delete' },
      { resource: 'backups', action: 'read' },
      { resource: 'backups', action: 'run' },
      { resource: 'config', action: 'read' },
      { resource: 'config', action: 'update' },
      { resource: 'notifications', action: 'read' },
      { resource: 'notifications', action: 'update' },
    ]);
    useAuthStore.getState().setRoleCodes(['ADMIN']);
  });

  it('users list shows activate for deactivated user and hides self status toggle', async () => {
    server.use(
      http.get(`${BASE}/users`, () =>
        HttpResponse.json({
          items: [
            {
              id: 1,
              email: 'admin@example.com',
              first_name: 'Admin',
              father_name: null,
              family_name: null,
              status: 'active',
              branch_id: 1,
              last_login_at: null,
              bootstrap_admin_protected: false,
            },
            {
              id: 2,
              email: 'off@example.com',
              first_name: 'Off',
              father_name: null,
              family_name: null,
              status: 'deactivated',
              branch_id: null,
              last_login_at: null,
              bootstrap_admin_protected: false,
            },
          ],
          total: 2,
          limit: 20,
          offset: 0,
        }),
      ),
      http.get(`${BASE}/users/:id/roles`, () => HttpResponse.json([])),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersList />, { initialEntries: ['/admin/users'] });
    await screen.findByText('off@example.com');

    const menuButtons = await screen.findAllByRole('button', { name: /قائمة|open menu/i });
    await user.click(menuButtons[0]!);
    expect(screen.queryByRole('menuitem', { name: /تعطيل|deactivate/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /تفعيل|activate/i })).toBeNull();
    await user.keyboard('{Escape}');

    await user.click(menuButtons[1]!);
    expect(await screen.findByRole('menuitem', { name: /تفعيل|activate/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /تعطيل|deactivate/i })).toBeNull();
  });

  it('users list create dialog has no initial password field (MSW)', async () => {
    let postedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/users`, async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: 3,
          email: postedBody.email,
          first_name: postedBody.first_name ?? null,
          father_name: null,
          family_name: null,
          status: 'pending_onboarding',
          branch_id: null,
          last_login_at: null,
          bootstrap_admin_protected: false,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersList />, { initialEntries: ['/admin/users'] });
    await user.click(await screen.findByRole('button', { name: /مستخدم جديد|create user|create/i }));
    const dialog = await screen.findByRole('dialog', { name: /إنشاء مستخدم|create user/i });
    const dialogScope = within(dialog);
    expect(dialog.querySelector('input[type="password"]')).toBeNull();
    const [firstNameInput] = dialogScope.getAllByRole('textbox');
    await user.type(firstNameInput, 'Staff');
    await user.type(dialogScope.getByPlaceholderText('user@example.com'), 'staff@example.com');
    await user.click(screen.getByRole('button', { name: /حفظ|save/i }));
    await waitFor(() => {
      expect(postedBody).not.toBeNull();
    });
    expect(postedBody).not.toHaveProperty('password');
  });

  it('create user happy path (MSW)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserCreate />, { initialEntries: ['/'] });
    await user.type(await screen.findByLabelText(/البريد|email/i), 'x@x.com');
    await user.type(await screen.findByLabelText(/الاسم|name/i), 'X');
    await user.click(screen.getByRole('button', { name: /حفظ|save/i }));
    await waitFor(() => {
      expect(screen.getByText(/2/)).toBeInTheDocument();
    });
  });

  it('create user keeps backend duplicate-email reason visible (localized)', async () => {
    server.use(
      http.post(`${BASE}/users`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'bad_request',
              message: 'Request failed',
              details: { detail: 'email_already_exists' },
            },
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<UserCreate />, { initialEntries: ['/'] });
    await user.type(await screen.findByLabelText(/البريد|email/i), 'x@x.com');
    await user.type(await screen.findByLabelText(/الاسم|name/i), 'X');
    await user.click(screen.getByRole('button', { name: /حفظ|save/i }));

    expect(await screen.findByText(/هذا البريد الإلكتروني مسجّل مسبقًا/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /حفظ|save/i })).toBeInTheDocument();
  });

  it('create user maps backend email validation to the email field', async () => {
    server.use(
      http.post(`${BASE}/users`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Request failed',
              details: {
                errors: [
                  {
                    loc: ['body', 'email'],
                    msg: "value is not a valid email address: invalid ','",
                    type: 'value_error',
                  },
                ],
              },
            },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<UserCreate />, { initialEntries: ['/'] });
    await user.type(await screen.findByLabelText(/البريد|email/i), 'x@x.com');
    await user.type(await screen.findByLabelText(/الاسم|name/i), 'X');
    await user.click(screen.getByRole('button', { name: /حفظ|save/i }));

    expect(await screen.findByText(/أدخل بريدًا إلكترونيًا صالحًا/)).toBeInTheDocument();
  });

  it('role list shows system role', async () => {
    renderWithProviders(<RolesList />, { initialEntries: ['/'] });
    expect(await screen.findByText('ADMIN')).toBeInTheDocument();
  });

  it('backups: trigger completes and re-enables button', async () => {
    let resolveRun: (v: unknown) => void;
    const p = new Promise<unknown>((r) => {
      resolveRun = r;
    });
    server.use(
      http.post(`${BASE}/admin/backups/run`, async () => {
        await p;
        return HttpResponse.json({
          success: true,
          started_at: '2020-01-01T00:00:00Z',
          finished_at: '2020-01-01T00:00:00Z',
          output_file: '/a.dump',
          message: 'ok',
          s3_uploaded: false,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<BackupsList />, { initialEntries: ['/'] });
    const btn = await screen.findByRole('button', { name: /تشغيل|run|backup|نسخ/i });
    await user.click(btn);
    expect(btn).toBeDisabled();
    resolveRun!(undefined);
    await waitFor(() => {
      expect(btn).not.toBeDisabled();
    });
  });

  it('notifications: sends a simple broadcast', async () => {
    let sentTitle = '';
    server.use(
      http.post(`${BASE}/admin/notifications/broadcast`, async ({ request }) => {
        const body = (await request.json()) as { title: string };
        sentTitle = body.title;
        return HttpResponse.json({
          deliveries_created: 1,
          deliveries_sent: 0,
          deliveries_failed: 0,
          deliveries_skipped: 1,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<SendNow />, { initialEntries: ['/admin/notifications/send-now'] });
    await user.type(await screen.findByLabelText(/العنوان|title/i), 'Hello team');
    await user.type(await screen.findByLabelText(/الرسالة|message/i), 'Please check today tasks.');
    await user.click(screen.getByRole('button', { name: /إرسال الآن|send now/i }));
    await waitFor(() => {
      expect(sentTitle).toBe('Hello team');
    });
  });
});

describe('branches list archive filter', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 't',
      refreshToken: null,
      user: { id: 1, email: 'a@a.com' } as never,
      permissions: new Set<string>(),
    });
    useAuthStore.getState().setPermissions([
      { resource: 'branches', action: 'read' },
      { resource: 'branches', action: 'delete' },
      { resource: 'branches', action: 'update' },
    ]);
  });

  it('hides archived by default, shows with toggle', async () => {
    server.use(
      http.get(`${BASE}/branches`, ({ request }) => {
        const u = new URL(request.url);
        if (u.searchParams.get('include_archived') === 'true') {
          return HttpResponse.json([
            {
              id: 1,
              code: 'A',
              name: 'Archived',
              address: null,
              timezone: 'UTC',
              is_active: false,
              archived_at: '2020-01-01T00:00:00Z',
            },
          ]);
        }
        return HttpResponse.json([
          {
            id: 2,
            code: 'B',
            name: 'Active',
            address: null,
            timezone: 'UTC',
            is_active: true,
            archived_at: null,
          },
        ]);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<BranchesList />, { initialEntries: ['/'] });
    expect(await screen.findByText('B')).toBeInTheDocument();
    expect(screen.queryByText('A')).toBeNull();
    const sw = await screen.findByRole('switch');
    await user.click(sw);
    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });
  });

  it('archive dialog uses Arabic confirm keyword without soft-delete description', async () => {
    await i18n.changeLanguage('ar');
    server.use(
      http.get(`${BASE}/branches`, () =>
        HttpResponse.json([
          {
            id: 2,
            code: 'B',
            name: 'Active',
            address: null,
            timezone: 'UTC',
            is_active: true,
            archived_at: null,
            kind: 'commercial',
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<BranchesList />, { initialEntries: ['/'] });
    await screen.findByText('Active');
    await user.click(screen.getByRole('button', { name: 'أرشفة' }));
    expect(await screen.findByText('اكتب «أرشفة» للتأكيد')).toBeInTheDocument();
    expect(screen.queryByText(/حذف ناعم/)).toBeNull();
    expect(screen.queryByText('ARCHIVE')).toBeNull();
  });
});

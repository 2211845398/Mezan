import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import BackupsList from '@/features/admin/pages/backups/BackupsList';
import BranchesList from '@/features/admin/pages/branches/BranchesList';
import RolesList from '@/features/admin/pages/roles/RolesList';
import UserCreate from '@/features/admin/pages/users/UserCreate';
import { useAuthStore } from '@/features/auth/stores/authStore';
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
    ]);
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
});

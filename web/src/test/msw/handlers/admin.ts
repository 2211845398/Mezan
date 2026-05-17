import { http, HttpResponse } from 'msw';

import type { UserRead } from '@/api/types';
import { now, toISOStringUtc } from '@/lib/date';

import { DEFAULT_USER } from './auth';

const BASE = '/api/v1';

const user2: UserRead = {
  ...DEFAULT_USER,
  id: 2,
  email: 'new@example.com',
  first_name: 'New',
  father_name: null,
  family_name: 'User',
  status: 'active',
  branch_id: 1,
  last_login_at: null,
} as UserRead;

export const adminHandlers = [
  http.get(`${BASE}/users`, () => HttpResponse.json([DEFAULT_USER, user2])),
  http.get(`${BASE}/users/onboarding-assignees`, () => HttpResponse.json([DEFAULT_USER, user2])),
  http.get(`${BASE}/users/1`, () => HttpResponse.json(DEFAULT_USER)),
  http.get(`${BASE}/users/2`, () => HttpResponse.json(user2)),
  http.patch(`${BASE}/users/:id`, () => HttpResponse.json(user2)),
  http.post(`${BASE}/users`, async ({ request }) => {
    const body = (await request.json()) as {
      email: string;
      first_name?: string | null;
      father_name?: string | null;
      family_name?: string | null;
    };
    return HttpResponse.json({
      id: 2,
      email: body.email,
      first_name: body.first_name ?? null,
      father_name: body.father_name ?? null,
      family_name: body.family_name ?? null,
      status: 'pending_onboarding',
      branch_id: null,
      last_login_at: null,
    } satisfies UserRead);
  }),
  http.get(`${BASE}/users/:id/roles`, () => HttpResponse.json([])),
  http.post(`${BASE}/users/:id/roles`, () => HttpResponse.json({ message: 'ok' })),
  http.delete(`${BASE}/users/:id/roles`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/users/:id/permission-overrides`, () => HttpResponse.json([])),
  http.put(`${BASE}/users/:id/permission-overrides`, () =>
    HttpResponse.json({
      id: 1,
      user_id: 1,
      permission_id: 1,
      branch_id: null,
      effect: 'allow',
      reason: null,
      created_by_user_id: 1,
      created_at: toISOStringUtc(now()),
    }),
  ),
  http.delete(`${BASE}/users/:id/permission-overrides/:oid`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/hr/onboarding/pending`, () => HttpResponse.json([])),
  http.get(`${BASE}/permissions`, () => HttpResponse.json([{ id: 1, resource: 'users', action: 'read' }])),
  http.get(`${BASE}/roles`, () =>
    HttpResponse.json([
      {
        id: 1,
        code: 'ADMIN',
        name: 'Admin',
        description: null,
        is_system: true,
        permission_ids: [1, 2],
      },
    ]),
  ),
  http.put(`${BASE}/roles/:id/permissions`, () =>
    HttpResponse.json({
      id: 1,
      code: 'X',
      name: 'X',
      description: null,
      is_system: false,
      permission_ids: [1],
    }),
  ),
  http.get(`${BASE}/branches`, () =>
    HttpResponse.json([
      {
        id: 1,
        code: 'MAIN',
        name: 'Main',
        address: null,
        timezone: 'UTC',
        is_active: true,
        archived_at: null,
      },
    ]),
  ),
  http.put(`${BASE}/branches/:id`, () =>
    HttpResponse.json({
      id: 1,
      code: 'MAIN',
      name: 'Main',
      address: null,
      timezone: 'UTC',
      is_active: true,
      archived_at: null,
    }),
  ),
  http.delete(`${BASE}/branches/:id`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${BASE}/terminals`, () =>
    HttpResponse.json({
      id: 1,
      branch_id: 1,
      name: 'T1',
      terminal_code: 'T1',
      is_authorized: false,
      api_key: 'pos_x',
    }),
  ),
  http.patch(`${BASE}/terminals/:id`, () => HttpResponse.json({})),
  http.get(`${BASE}/admin/backups/status`, () =>
    HttpResponse.json({
      success: true,
      started_at: '2020-01-01T00:00:00Z',
      finished_at: '2020-01-01T00:01:00Z',
      output_file: '/x.dump',
      message: 'ok',
      s3_uploaded: false,
    }),
  ),
  http.post(`${BASE}/admin/backups/run`, () =>
    HttpResponse.json({
      success: true,
      started_at: '2020-01-01T00:00:00Z',
      finished_at: '2020-01-01T00:01:00Z',
      output_file: '/x.dump',
      message: 'ok',
      s3_uploaded: false,
    }),
  ),
  http.get(`${BASE}/admin/notifications/templates`, () => HttpResponse.json([])),
  http.put(`${BASE}/admin/notifications/templates`, () =>
    HttpResponse.json({
      id: 1,
      kind: 'k',
      title_template: 't',
      body_template: 'b',
      default_data: {},
      is_active: true,
      created_at: toISOStringUtc(now()),
      updated_at: toISOStringUtc(now()),
    }),
  ),
  http.get(`${BASE}/admin/notifications/schedules`, () => HttpResponse.json({ items: [] })),
  http.put(`${BASE}/admin/notifications/schedules`, () =>
    HttpResponse.json({
      id: 1,
      name: 's',
      kind: 'k',
      interval_minutes: 60,
      target_role_code: null,
      branch_id: null,
      parameters: {},
      is_active: true,
      last_run_at: null,
      next_run_at: null,
    }),
  ),
  http.get(`${BASE}/admin/notifications/runs`, () => HttpResponse.json([])),
  http.get(`${BASE}/admin/notifications/deliveries`, () =>
    HttpResponse.json({
      items: [
        {
          id: 1,
          schedule_id: null,
          user_id: 1,
          template_kind: 'manual',
          title: 'Hello',
          body: 'World',
          data: {},
          status: 'skipped',
          provider: 'mock',
          provider_message_id: null,
          error_code: null,
          error_message: null,
          created_at: toISOStringUtc(now()),
          sent_at: null,
          read_at: null,
        },
      ],
    }),
  ),
  http.post(`${BASE}/admin/notifications/broadcast`, () =>
    HttpResponse.json({
      deliveries_created: 1,
      deliveries_sent: 0,
      deliveries_failed: 0,
      deliveries_skipped: 1,
    }),
  ),
  http.post(`${BASE}/admin/notifications/schedules/:id/run`, () => HttpResponse.json({})),
  http.delete(`${BASE}/admin/notifications/schedules/:id`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/notifications/deliveries/me`, () =>
    HttpResponse.json({
      items: [
        {
          id: 1,
          schedule_id: null,
          user_id: 1,
          template_kind: 'manual',
          title: 'Hello cashier',
          body: 'Open your shift',
          data: { path: '/hr/leave' },
          status: 'skipped',
          provider: 'mock',
          provider_message_id: null,
          error_code: null,
          error_message: null,
          created_at: toISOStringUtc(now()),
          sent_at: null,
          read_at: null,
        },
      ],
    }),
  ),
  http.get(`${BASE}/notifications/deliveries/me/unread-count`, () =>
    HttpResponse.json({ unread_count: 1 }),
  ),
  http.patch(`${BASE}/notifications/deliveries/:id/read`, () =>
    HttpResponse.json({
      id: 1,
      schedule_id: null,
      user_id: 1,
      template_kind: 'manual',
      title: 'Hello cashier',
      body: 'Open your shift',
      data: { path: '/hr/leave' },
      status: 'skipped',
      provider: 'mock',
      provider_message_id: null,
      error_code: null,
      error_message: null,
      created_at: toISOStringUtc(now()),
      sent_at: null,
      read_at: toISOStringUtc(now()),
    }),
  ),
  http.post(`${BASE}/notifications/deliveries/me/read-all`, () =>
    HttpResponse.json({ updated: 1 }),
  ),
  http.get(`${BASE}/config`, () => HttpResponse.json([])),
];

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { server } from '@/test/msw/server';

import * as api from '../api';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

describe('W-5.5 HR', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    server.resetHandlers();
    useAuthStore.getState().clear();
  });

  it('createEmployee posts JSON to /employees', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/employees`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            id: 1,
            user_id: 5,
            hire_date: '2020-01-01',
            base_salary: '1000',
            hourly_rate: null,
            bank_account: null,
          },
          { status: 200 },
        );
      }),
    );
    await api.createEmployee({ user_id: 5, hire_date: '2020-01-01', base_salary: '1000' });
    expect(body).toMatchObject({ user_id: 5, base_salary: '1000' });
  });

  it('reviewLeaveRequest posts review_notes and Idempotency-Key', async () => {
    let body: unknown;
    let idem: string | null = null;
    server.use(
      http.post(`${API}/leave-requests/2/review`, async ({ request }) => {
        body = await request.json();
        idem = request.headers.get('Idempotency-Key');
        return HttpResponse.json(
          {
            id: 2,
            status: 'approved',
            leave_type: 'vacation',
            start_date: '2026-01-01',
            end_date: '2026-01-02',
            employee_profile_id: 1,
            reason: null,
            reviewed_by_user_id: 1,
            reviewed_at: '2026-01-01T00:00:00Z',
            review_notes: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            vacation_balance_remaining: '10',
          },
          { status: 200 },
        );
      }),
    );
    const k = 'd'.repeat(12);
    await api.reviewLeaveRequest(2, { action: 'approve', review_notes: 'ok', idempotency_key: k }, k);
    expect(idem).toBe(k);
    expect(body).toMatchObject({ action: 'approve', review_notes: 'ok', idempotency_key: k });
  });
});

import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, waitFor } from '@/test/utils';

import * as api from '../api';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

const payslipDraft = {
  id: 7,
  employee_profile_id: 1,
  period_start: '2025-01-01',
  period_end: '2025-01-31',
  hours_worked: '40',
  hourly_rate: '10.00',
  deductions: '0.00',
  gross_amount: '400.00',
  net_amount: '400.00',
  status: 'draft' as const,
  immutable_hash: 'h',
  approved_by_user_id: null,
  approved_at: null,
  generate_idempotency_key: null,
  approve_idempotency_key: null,
};

describe('W-5.5 payroll', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    server.resetHandlers();
    useAuthStore.getState().clear();
  });

  it('payroll: generate → approve → export hits /payroll/export with blob (MSW)', async () => {
    const calls: { kind: 'gen' | 'appr' | 'exp' }[] = [];
    server.use(
      http.post(`${API}/payroll/payslips/generate`, () => {
        calls.push({ kind: 'gen' });
        return HttpResponse.json(payslipDraft, { status: 200 });
      }),
      http.post(`${API}/payroll/payslips/approve`, () => {
        calls.push({ kind: 'appr' });
        return HttpResponse.json({ ...payslipDraft, status: 'approved' }, { status: 200 });
      }),
      http.get(`${API}/payroll/export`, () => {
        calls.push({ kind: 'exp' });
        return new HttpResponse(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'text/csv' },
        });
      }),
    );
    const idem1 = 'a'.repeat(12);
    const idem2 = 'b'.repeat(12);
    await api.generatePayslip(
      {
        employee_profile_id: 1,
        period_start: '2025-01-01',
        period_end: '2025-01-31',
        deductions: '0',
        idempotency_key: idem1,
      },
      idem1,
    );
    await api.approvePayslip({ payslip_id: 7, idempotency_key: idem2 }, idem2);
    const blob = await api.exportPayrollCsvBlob();
    expect(blob).toBeInstanceOf(Blob);
    expect(calls).toEqual([{ kind: 'gen' }, { kind: 'appr' }, { kind: 'exp' }]);
  });

  it('Run detail: no Approve when user lacks payroll:approve', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([
      { resource: 'payroll', action: 'read' },
      { resource: 'payroll', action: 'create' },
    ]);

    server.use(
      http.get(`${API}/payroll/payslips/1`, () =>
        HttpResponse.json({ ...payslipDraft, id: 1 }, { status: 200 }),
      ),
    );

    const { default: RunDetail } = await import('../pages/runs/RunDetail');
    renderWithProviders(
      <Routes>
        <Route path="/payroll/runs/:id" element={<RunDetail />} />
      </Routes>,
      { initialEntries: ['/payroll/runs/1'] },
    );

    expect(await screen.findByText(/Payslip #1/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
    });
  });
});

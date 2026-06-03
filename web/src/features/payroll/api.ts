import { apiClient } from '@/api/client';
import type { PaginatedList } from '@/api/pagination';
import type { components } from '@/api/generated/schema';

export type PayslipRead = components['schemas']['PayslipRead'];
export type PayslipGenerateRequest = components['schemas']['PayslipGenerateRequest'];
export type PayslipApproveRequest = components['schemas']['PayslipApproveRequest'];

export type PayrollOverviewRow = {
  employee_profile_id: number;
  user_email?: string | null;
  user_full_name?: string | null;
  user_role_code?: string | null;
  base_salary?: string | null;
  hourly_rate?: string | null;
  payslip_id?: number | null;
  payslip_status: string;
  paid_at?: string | null;
  gross_amount?: string | null;
  net_amount?: string | null;
  deductions_total?: string | null;
  automatic_deductions_amount?: string | null;
  manual_deductions_amount?: string | null;
  bonus_amount?: string | null;
  overtime_amount?: string | null;
  base_salary_amount?: string | null;
};

export type PayrollPeriodSummary = {
  employees_total: number;
  payslips_missing: number;
  payslips_draft: number;
  payslips_approved_unpaid: number;
  payslips_paid: number;
  gross_total: string;
  net_total: string;
  automatic_deductions_total: string;
  manual_deductions_total: string;
  bonus_total: string;
};

export type PayrollPeriodRead = {
  year: number;
  month: number;
  period_start: string;
  period_end: string;
  approval_opens_on: string;
  is_approval_open: boolean;
  summary: PayrollPeriodSummary;
  rows: PayrollOverviewRow[];
};

export type PayrollPeriodPrepareResult = {
  year: number;
  month: number;
  period_start: string;
  period_end: string;
  created_count: number;
  recalculated_count: number;
  skipped_existing_count: number;
  skipped_inactive_count: number;
  failures: { employee_profile_id: number; message: string; code?: string | null }[];
};

export type AttendancePayrollPolicyRead = {
  id: number;
  role_code: string;
  attendance_category: string;
  grace_minutes: number;
  absence_deduction_amount: string;
  late_deduction_amount: string;
  early_close_deduction_amount: string;
  overtime_multiplier: string;
  is_active: boolean;
};

export type AttendancePayrollPolicyUpsert = {
  attendance_category: 'exempt' | 'office' | 'operational';
  grace_minutes: number;
  absence_deduction_amount: string;
  late_deduction_amount: string;
  early_close_deduction_amount: string;
  overtime_multiplier: string;
  is_active: boolean;
};

export async function listPayslips(params?: {
  status?: string;
  period_start?: string;
  period_end?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedList<PayslipRead>> {
  const { data } = await apiClient.get<PaginatedList<PayslipRead>>('/payroll/payslips', { params });
  return data;
}

export async function getPayslip(id: number): Promise<PayslipRead> {
  const { data } = await apiClient.get<PayslipRead>(`/payroll/payslips/${id}`);
  return data;
}

export async function generatePayslip(
  body: PayslipGenerateRequest,
  idempotencyKey: string,
): Promise<PayslipRead> {
  const { data } = await apiClient.post<PayslipRead>('/payroll/payslips/generate', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export async function approvePayslip(
  body: PayslipApproveRequest,
  idempotencyKey: string,
): Promise<PayslipRead> {
  const { data } = await apiClient.post<PayslipRead>('/payroll/payslips/approve', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export async function recalculatePayslip(payslipId: number): Promise<PayslipRead> {
  const { data } = await apiClient.post<PayslipRead>(`/payroll/payslips/${payslipId}/recalculate`);
  return data;
}

export async function patchPayslipAdjustments(
  payslipId: number,
  body: { bonus_amount?: string | null; manual_deductions?: string | null },
): Promise<PayslipRead> {
  const { data } = await apiClient.patch<PayslipRead>(`/payroll/payslips/${payslipId}/adjustments`, body);
  return data;
}

export async function listPayrollOverview(params: {
  period_start: string;
  period_end: string;
}): Promise<PayrollOverviewRow[]> {
  const { data } = await apiClient.get<PayrollOverviewRow[]>('/payroll/overview', { params });
  return data;
}

export async function approveAndPay(
  body: { period_start: string; period_end: string; idempotency_key?: string | null },
  idempotencyKey: string,
): Promise<PayslipRead[]> {
  const { data } = await apiClient.post<PayslipRead[]>('/payroll/approve-and-pay', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export async function markPayslipsPaid(
  body: { period_start: string; period_end: string; idempotency_key?: string | null },
  idempotencyKey: string,
): Promise<PayslipRead[]> {
  const { data } = await apiClient.post<PayslipRead[]>('/payroll/payout/mark-paid', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export async function listAttendancePayrollPolicies(): Promise<AttendancePayrollPolicyRead[]> {
  const { data } = await apiClient.get<AttendancePayrollPolicyRead[]>(
    '/payroll/policies/attendance-deductions',
  );
  return data;
}

export async function upsertAttendancePayrollPolicy(
  roleCode: string,
  body: AttendancePayrollPolicyUpsert,
): Promise<AttendancePayrollPolicyRead> {
  const { data } = await apiClient.put<AttendancePayrollPolicyRead>(
    `/payroll/policies/attendance-deductions/${encodeURIComponent(roleCode)}`,
    body,
  );
  return data;
}

export async function getPayrollPeriod(year: number, month: number): Promise<PayrollPeriodRead> {
  const { data } = await apiClient.get<PayrollPeriodRead>(`/payroll/periods/${year}/${month}`);
  return data;
}

export async function preparePayrollPeriod(
  year: number,
  month: number,
): Promise<PayrollPeriodPrepareResult> {
  const { data } = await apiClient.post<PayrollPeriodPrepareResult>(
    `/payroll/periods/${year}/${month}/prepare`,
  );
  return data;
}

export async function approvePayrollPeriod(
  year: number,
  month: number,
  idempotencyKey: string,
): Promise<PayslipRead[]> {
  const { data } = await apiClient.post<PayslipRead[]>(
    `/payroll/periods/${year}/${month}/approve-and-pay`,
    { idempotency_key: idempotencyKey },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data;
}

export async function exportPayrollPeriodPdfBlob(year: number, month: number): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/payroll/periods/${year}/${month}/export.pdf`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportPayrollPeriodExcelBlob(year: number, month: number): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/payroll/periods/${year}/${month}/export.csv`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportPayrollCsvBlob(): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/payroll/export', { responseType: 'blob' });
  return data;
}

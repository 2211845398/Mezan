import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

export type PayslipRead = components['schemas']['PayslipRead'];
export type PayslipGenerateRequest = components['schemas']['PayslipGenerateRequest'];
export type PayslipApproveRequest = components['schemas']['PayslipApproveRequest'];

export async function listPayslips(params?: { status?: string }): Promise<PayslipRead[]> {
  const { data } = await apiClient.get<PayslipRead[]>('/payroll/payslips', { params });
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

export async function exportPayrollCsvBlob(): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/payroll/export', { responseType: 'blob' });
  return data;
}

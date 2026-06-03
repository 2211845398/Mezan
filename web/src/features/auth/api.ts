import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';
import type {
  CustomerCompleteOnboardingRequest,
  CustomerRead,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  PasswordResetConfirm,
  PasswordResetRequest,
  PermissionRead,
  RefreshRequest,
  TokenResponse,
  UserRead,
  UserUpdate,
} from '@/api/types';

export type {
  CustomerCompleteOnboardingRequest,
  CustomerRead,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  PasswordResetConfirm,
  PasswordResetRequest,
  PermissionRead,
  RefreshRequest,
  TokenResponse,
  UserRead,
  UserUpdate,
};

export async function login(body: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', body);
  return data;
}

export async function refresh(body: RefreshRequest): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/auth/refresh', body);
  return data;
}

export async function logout(body: LogoutRequest): Promise<void> {
  await apiClient.post('/auth/logout', body);
}

export type BranchBrief = {
  id: number;
  name: string;
  code?: string | null;
};

export async function getMe(): Promise<UserRead> {
  const { data } = await apiClient.get<UserRead>('/auth/me');
  return data;
}

/** Assigned branch label without ``branches:read`` (cashier, etc.). */
export async function getMyBranch(): Promise<BranchBrief> {
  const { data } = await apiClient.get<BranchBrief>('/auth/me/branch');
  return data;
}

type UpdateMeBody = paths['/api/v1/auth/me']['patch']['requestBody']['content']['application/json'];

export async function updateMe(body: UpdateMeBody, idempotencyKey?: string): Promise<UserRead> {
  const { data } = await apiClient.patch<UserRead>('/auth/me', body, {
    ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
  });
  return data;
}

export async function uploadMyAvatar(file: File): Promise<UserRead> {
  const body = new FormData();
  body.append('file', file);
  const { data } = await apiClient.post<UserRead>('/auth/me/avatar', body);
  return data;
}

export async function getMyPermissions(): Promise<PermissionRead[]> {
  const { data } = await apiClient.get<PermissionRead[]>('/auth/me/permissions');
  return data;
}

export async function getMyRoles(): Promise<{ codes: string[] }> {
  const { data } = await apiClient.get<{ codes: string[] }>('/auth/me/roles');
  return data;
}

export async function requestPasswordReset(body: PasswordResetRequest): Promise<void> {
  await apiClient.post('/auth/password-reset/request', body);
}

export async function confirmPasswordReset(body: PasswordResetConfirm): Promise<void> {
  await apiClient.post('/auth/password-reset/confirm', body);
}

export async function completeCustomerOnboarding(
  body: CustomerCompleteOnboardingRequest,
): Promise<CustomerRead> {
  const { data } = await apiClient.post<CustomerRead>('/customers/onboarding/complete', body);
  return data;
}

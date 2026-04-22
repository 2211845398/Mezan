import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

/*
 * Thin typed helpers over the FastAPI auth endpoints. Every helper uses the
 * generated OpenAPI component schemas so any backend contract change surfaces
 * as a TS error here before it reaches a page.
 */

export type LoginRequest = components['schemas']['LoginRequest'];
export type LoginResponse = components['schemas']['LoginResponse'];
export type TokenResponse = components['schemas']['TokenResponse'];
export type RefreshRequest = components['schemas']['RefreshRequest'];
export type LogoutRequest = components['schemas']['LogoutRequest'];
export type PasswordResetRequest = components['schemas']['PasswordResetRequest'];
export type PasswordResetConfirm = components['schemas']['PasswordResetConfirm'];
export type UserRead = components['schemas']['UserRead'];
export type PermissionRead = components['schemas']['app__api__v1__auth__PermissionRead'];

export type CustomerCompleteOnboardingRequest =
  components['schemas']['CustomerCompleteOnboardingRequest'];
export type CustomerRead = components['schemas']['CustomerRead'];

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

export async function getMe(): Promise<UserRead> {
  const { data } = await apiClient.get<UserRead>('/auth/me');
  return data;
}

export async function getMyPermissions(): Promise<PermissionRead[]> {
  const { data } = await apiClient.get<PermissionRead[]>('/auth/me/permissions');
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
  const { data } = await apiClient.post<CustomerRead>(
    '/customers/onboarding/complete',
    body,
  );
  return data;
}

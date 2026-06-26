/**
 * Stable named aliases for generated OpenAPI types. Feature code imports from
 * here — not from `generated/schema.ts` — so schema renames touch one file.
 */
import type { components } from '@/api/generated/schema';

export type LoginRequest = components['schemas']['LoginRequest'];
export type LoginResponse = components['schemas']['LoginResponse'] & {
  access_token?: string | null;
  refresh_token?: string | null;
  must_change_password?: boolean;
  requires_2fa?: boolean;
  challenge_token?: string | null;
};
export type TokenResponse = components['schemas']['TokenResponse'];
export type RefreshRequest = components['schemas']['RefreshRequest'];
export type LogoutRequest = components['schemas']['LogoutRequest'];
export type PasswordResetRequest = components['schemas']['PasswordResetRequest'];
export type PasswordResetConfirm = components['schemas']['PasswordResetConfirm'];
export type UserRead = components['schemas']['UserRead'] & {
  branch_name?: string | null;
  must_change_password?: boolean;
  two_factor_enabled?: boolean;
};
export type UserUpdate = components['schemas']['UserUpdate'];
export type ProfileUpdate = components['schemas']['ProfileUpdate'];
export type PermissionRead = components['schemas']['app__api__v1__auth__PermissionRead'];

export type CustomerCompleteOnboardingRequest =
  components['schemas']['CustomerCompleteOnboardingRequest'];
export type CustomerRead = components['schemas']['CustomerRead'];

export type ProductRead = components['schemas']['ProductRead'];
export type PurchaseOrderRead = components['schemas']['PurchaseOrderRead'];
export type EmployeeProfileRead = components['schemas']['EmployeeProfileRead'];
export type PayslipRead = components['schemas']['PayslipRead'];
export type AccrualRuleRead = components['schemas']['AccrualRuleRead'];
export type DiscountRuleRead = components['schemas']['DiscountRuleRead'];
export type TrialBalanceRow = components['schemas']['TrialBalanceRow'];
export type ExecutiveKpiRead = components['schemas']['ExecutiveKpiRead'];

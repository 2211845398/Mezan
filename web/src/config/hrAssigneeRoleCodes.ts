/**
 * Users who may be picked as the HR onboarding assignee.
 * Must stay in sync with product policy; the API accepts any user id for `assigned_hr_user_id`.
 */
export const HR_ASSIGNEE_ELIGIBLE_ROLE_CODES = new Set([
  'OWNER',
  'ADMIN',
  'IT_ADMIN',
  'HR_MANAGER',
  'CASHIER',
]);

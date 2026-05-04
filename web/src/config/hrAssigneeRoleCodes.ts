/**
 * Users who may be picked as the HR onboarding assignee.
 * Must stay in sync with product policy; the API accepts any user id for `assigned_hr_user_id`.
 * Only HR, System Owner, and System Administrator can assign and enter employee details.
 */
export const HR_ASSIGNEE_ELIGIBLE_ROLE_CODES = new Set([
  'OWNER',        // System Owner
  'ADMIN',        // System Administrator
  'HR_MANAGER',   // HR
]);

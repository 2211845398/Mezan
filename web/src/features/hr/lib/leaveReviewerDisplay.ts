import type { LeaveRequestRead } from '../api';

/** Human-readable reviewer label for leave tables (name preferred over email/id). */
export function leaveReviewerDisplay(row: LeaveRequestRead): string {
  const extended = row as LeaveRequestRead & {
    reviewed_by_user_full_name?: string | null;
    reviewed_by_user_email?: string | null;
  };
  const name = extended.reviewed_by_user_full_name?.trim();
  if (name) return name;
  const email = extended.reviewed_by_user_email?.trim();
  if (email) return email;
  return '—';
}

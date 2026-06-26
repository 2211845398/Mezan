import { describe, expect, it } from 'vitest';

import type { LeaveRequestRead } from '../../api';
import { leaveReviewerDisplay } from '../leaveReviewerDisplay';

const base: LeaveRequestRead = {
  id: 1,
  employee_profile_id: 2,
  leave_type: 'vacation',
  status: 'approved',
  start_date: '2026-06-07',
  end_date: '2026-06-12',
  reviewed_by_user_id: 1,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

describe('leaveReviewerDisplay', () => {
  it('prefers full name over email and id', () => {
    expect(
      leaveReviewerDisplay({
        ...base,
        reviewed_by_user_full_name: 'أحمد محمد',
        reviewed_by_user_email: 'ahmed@example.com',
      }),
    ).toBe('أحمد محمد');
  });

  it('falls back to email when name missing', () => {
    expect(
      leaveReviewerDisplay({
        ...base,
        reviewed_by_user_email: 'reviewer@example.com',
      }),
    ).toBe('reviewer@example.com');
  });

  it('returns dash when no reviewer info', () => {
    expect(
      leaveReviewerDisplay({
        ...base,
        reviewed_by_user_id: null,
      }),
    ).toBe('—');
  });
});

import { describe, expect, it } from 'vitest';

import { isAttendanceWideRangeBlocked } from '../attendanceQueryGuard';

describe('isAttendanceWideRangeBlocked', () => {
  it('blocks unscoped ranges longer than 30 days', () => {
    expect(isAttendanceWideRangeBlocked('2025-01-01', '2025-02-15', '', '')).toBe(true);
  });

  it('allows exactly 30 inclusive days without scope', () => {
    expect(isAttendanceWideRangeBlocked('2025-01-01', '2025-01-30', '', '')).toBe(false);
  });

  it('allows wide range when branch is selected', () => {
    expect(isAttendanceWideRangeBlocked('2025-01-01', '2025-03-01', '3', '')).toBe(false);
  });

  it('allows wide range when employee is selected', () => {
    expect(isAttendanceWideRangeBlocked('2025-01-01', '2025-03-01', '', '42')).toBe(false);
  });
});

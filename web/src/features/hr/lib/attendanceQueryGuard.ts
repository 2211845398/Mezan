import { inclusiveCalendarDaySpan } from '@/lib/date';

/** Block unscoped queries when the inclusive date span exceeds 30 days. */
export function isAttendanceWideRangeBlocked(
  dateFrom: string,
  dateTo: string,
  branchId: string,
  employeeId: string,
): boolean {
  const span = inclusiveCalendarDaySpan(dateFrom, dateTo);
  return span > 30 && !branchId && !employeeId;
}

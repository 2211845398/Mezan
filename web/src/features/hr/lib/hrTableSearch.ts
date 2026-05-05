import type { TFunction } from 'i18next';

import { getBranchLabel } from '@/features/admin/lib/branchLabels';
import { roleCodeLabel } from '@/features/admin/lib/roleLabels';
import type { BranchRead, UserOnboardingRead } from '@/features/admin/types';

import type {
  AttendanceLogRead,
  EmployeeProfileRead,
  LeaveRequestRead,
  WeeklyScheduleRead,
} from '../api';

/** Localized weekday label for schedule tables (keys `schedule.weekday.0` … `schedule.weekday.6`). */
export function scheduleWeekdayLabel(weekday: number, t: TFunction<'hr'>): string {
  return t(`schedule.weekday.${weekday}`, { defaultValue: String(weekday) });
}

/** Values for TanStack global filter on `/hr/employees` (matches visible cells + ar/en labels). */
export function employeeProfileRowSearchValue(
  row: EmployeeProfileRead,
  opts: {
    branches?: BranchRead[];
    tStatusAr: TFunction<'admin'>;
    tStatusEn: TFunction<'admin'>;
    tRoleAr: TFunction<'admin'>;
    tRoleEn: TFunction<'admin'>;
  },
): string {
  const status = row.user_status ?? '';
  const sAr = status ? opts.tStatusAr(`users.user_status.${status}`, { defaultValue: status }) : '';
  const sEn = status ? opts.tStatusEn(`users.user_status.${status}`, { defaultValue: status }) : '';
  const code = (row.user_role_code ?? '').trim();
  const rName = (row.user_role_name ?? '').trim();
  const rAr = code ? roleCodeLabel(opts.tRoleAr, code, rName || code) : rName;
  const rEn = code ? roleCodeLabel(opts.tRoleEn, code, rName || code) : rName;
  const bid = row.user_branch_id ?? null;
  const b = opts.branches?.find((x) => x.id === bid);
  const branchLabel = getBranchLabel(opts.branches, bid);
  const parts = [
    row.user_full_name,
    row.user_email,
    status,
    sAr,
    sEn,
    code,
    rName,
    rAr,
    rEn,
    branchLabel,
    b?.code,
    b?.name,
    bid != null ? String(bid) : '',
    row.hire_date,
    row.base_salary != null ? String(row.base_salary) : '',
    row.hourly_rate != null ? String(row.hourly_rate) : '',
  ];
  return parts.filter(Boolean).join(' ');
}

export function pendingOnboardingRowSearchValue(
  row: UserOnboardingRead,
  opts: {
    branches?: BranchRead[];
    tRoleAr: TFunction<'admin'>;
    tRoleEn: TFunction<'admin'>;
    tStatusAr: TFunction<'admin'>;
    tStatusEn: TFunction<'admin'>;
  },
): string {
  const uStatus = row.user_status ?? '';
  const sAr = uStatus ? opts.tStatusAr(`users.user_status.${uStatus}`, { defaultValue: uStatus }) : '';
  const sEn = uStatus ? opts.tStatusEn(`users.user_status.${uStatus}`, { defaultValue: uStatus }) : '';
  const code = (row.user_role_code ?? '').trim();
  const rName = (row.user_role_name ?? '').trim();
  const rAr = code ? roleCodeLabel(opts.tRoleAr, code, rName || code) : rName;
  const rEn = code ? roleCodeLabel(opts.tRoleEn, code, rName || code) : rName;
  const bid = row.user_branch_id ?? null;
  const b = opts.branches?.find((x) => x.id === bid);
  const branchLabel = getBranchLabel(opts.branches, bid);
  const parts = [
    row.user_full_name,
    row.user_email,
    uStatus,
    sAr,
    sEn,
    code,
    rName,
    rAr,
    rEn,
    branchLabel,
    b?.code,
    b?.name,
    bid != null ? String(bid) : '',
    row.user_branch_name,
    row.requested_by_name,
    row.assigned_hr_name,
    row.created_at,
  ];
  return parts.filter(Boolean).join(' ');
}

export function weeklyScheduleRowSearchValue(
  row: WeeklyScheduleRead,
  opts: { weekdayLabel: string; branchName: string; statusWork: string; statusOff: string; hours: string },
): string {
  const status = row.is_day_off ? opts.statusOff : opts.statusWork;
  const hours = row.is_day_off ? '' : opts.hours;
  return [opts.weekdayLabel, opts.branchName, status, hours, String(row.branch_id), String(row.weekday)].join(
    ' ',
  );
}

export function attendanceLogRowSearchValue(
  row: AttendanceLogRead,
  opts: { employeeText: string; branchText: string; inText: string; outText: string; openText: string },
): string {
  return [
    opts.employeeText,
    opts.branchText,
    String(row.id),
    String(row.branch_id),
    String(row.employee_profile_id),
    opts.inText,
    opts.outText,
    opts.openText,
  ]
    .filter(Boolean)
    .join(' ');
}

export function leaveRequestRowSearchValue(
  row: LeaveRequestRead,
  opts: {
    employeeText: string;
    tHrAr: TFunction<'hr'>;
    tHrEn: TFunction<'hr'>;
  },
): string {
  const typeAr = opts.tHrAr(`leave.type.${row.leave_type}`, { defaultValue: row.leave_type });
  const typeEn = opts.tHrEn(`leave.type.${row.leave_type}`, { defaultValue: row.leave_type });
  const stAr = opts.tHrAr(`leave.st.${row.status}`, { defaultValue: row.status });
  const stEn = opts.tHrEn(`leave.st.${row.status}`, { defaultValue: row.status });
  const parts = [
    String(row.id),
    opts.employeeText,
    row.leave_type,
    typeAr,
    typeEn,
    row.status,
    stAr,
    stEn,
    row.start_date,
    row.end_date,
    row.reason,
    row.review_notes,
    row.reviewed_by_user_id != null ? String(row.reviewed_by_user_id) : '',
    row.reviewed_at,
    row.created_at,
    row.updated_at,
  ];
  return parts.filter(Boolean).join(' ');
}

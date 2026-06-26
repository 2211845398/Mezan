class WeeklyScheduleRead {
  const WeeklyScheduleRead({
    required this.id,
    required this.weekday,
    required this.startTime,
    required this.endTime,
    required this.isDayOff,
    required this.branchId,
  });

  factory WeeklyScheduleRead.fromJson(Map<String, dynamic> json) {
    return WeeklyScheduleRead(
      id: json['id'] as int,
      weekday: json['weekday'] as int,
      startTime: json['start_time'] as String,
      endTime: json['end_time'] as String,
      isDayOff: json['is_day_off'] as bool? ?? false,
      branchId: json['branch_id'] as int,
    );
  }

  final int id;
  final int weekday;
  final String startTime;
  final String endTime;
  final bool isDayOff;
  final int branchId;
}

class VacationLeaveBalanceRead {
  const VacationLeaveBalanceRead({
    required this.calendarYear,
    required this.usedDays,
    this.entitlementDays,
    this.remainingDays,
  });

  factory VacationLeaveBalanceRead.fromJson(Map<String, dynamic> json) {
    return VacationLeaveBalanceRead(
      calendarYear: json['calendar_year'] as int,
      entitlementDays: _num(json['entitlement_days']),
      usedDays: _num(json['used_days']) ?? '0',
      remainingDays: _num(json['remaining_days']),
    );
  }

  final int calendarYear;
  final String? entitlementDays;
  final String usedDays;
  final String? remainingDays;

  static String? _num(Object? value) => value?.toString();
}

class AttendanceLogRead {
  const AttendanceLogRead({
    required this.id,
    required this.branchId,
    required this.clockInAt,
    this.clockOutAt,
  });

  factory AttendanceLogRead.fromJson(Map<String, dynamic> json) {
    return AttendanceLogRead(
      id: json['id'] as int,
      branchId: json['branch_id'] as int,
      clockInAt: DateTime.parse(json['clock_in_at'] as String),
      clockOutAt: json['clock_out_at'] == null
          ? null
          : DateTime.parse(json['clock_out_at'] as String),
    );
  }

  final int id;
  final int branchId;
  final DateTime clockInAt;
  final DateTime? clockOutAt;

  bool get isOpen => clockOutAt == null;
}

enum TodayAttendanceStatus { notCheckedIn, checkedIn, completed }

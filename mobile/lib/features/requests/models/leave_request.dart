class LeaveRequestRead {
  const LeaveRequestRead({
    required this.id,
    required this.leaveType,
    required this.status,
    required this.startDate,
    required this.endDate,
    this.reason,
    this.reviewNotes,
    this.vacationBalanceRemaining,
  });

  factory LeaveRequestRead.fromJson(Map<String, dynamic> json) {
    return LeaveRequestRead(
      id: json['id'] as int,
      leaveType: json['leave_type'] as String,
      status: json['status'] as String,
      startDate: json['start_date'] as String,
      endDate: json['end_date'] as String,
      reason: json['reason'] as String?,
      reviewNotes: json['review_notes'] as String?,
      vacationBalanceRemaining:
          json['vacation_balance_remaining']?.toString(),
    );
  }

  final int id;
  final String leaveType;
  final String status;
  final String startDate;
  final String endDate;
  final String? reason;
  final String? reviewNotes;
  final String? vacationBalanceRemaining;
}

class LeaveBalanceRead {
  const LeaveBalanceRead({
    required this.calendarYear,
    required this.usedDays,
    this.entitlementDays,
    this.remainingDays,
  });

  factory LeaveBalanceRead.fromJson(Map<String, dynamic> json) {
    return LeaveBalanceRead(
      calendarYear: json['calendar_year'] as int,
      entitlementDays: json['entitlement_days']?.toString(),
      usedDays: json['used_days']?.toString() ?? '0',
      remainingDays: json['remaining_days']?.toString(),
    );
  }

  final int calendarYear;
  final String? entitlementDays;
  final String usedDays;
  final String? remainingDays;
}

class HrFeedbackRead {
  const HrFeedbackRead({
    required this.id,
    required this.message,
    required this.status,
    required this.createdAt,
    this.category,
  });

  factory HrFeedbackRead.fromJson(Map<String, dynamic> json) {
    return HrFeedbackRead(
      id: json['id'] as int,
      message: json['message'] as String,
      status: json['status'] as String,
      createdAt: json['created_at'] as String,
      category: json['category'] as String?,
    );
  }

  final int id;
  final String message;
  final String status;
  final String createdAt;
  final String? category;
}

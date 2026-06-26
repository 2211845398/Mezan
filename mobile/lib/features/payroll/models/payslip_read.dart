class PayslipDeductionLine {
  const PayslipDeductionLine({
    required this.amount,
    required this.reason,
    required this.source,
    this.date,
  });

  factory PayslipDeductionLine.fromJson(Map<String, dynamic> json) {
    return PayslipDeductionLine(
      amount: json['amount']?.toString() ?? '0',
      reason: json['reason'] as String? ?? '',
      source: json['source'] as String? ?? 'automatic',
      date: json['date'] as String?,
    );
  }

  final String amount;
  final String reason;
  final String source;
  final String? date;

  bool get isDetailOnly => amount == '0' || amount == '0.00';
}

class PayslipRead {
  const PayslipRead({
    required this.id,
    required this.periodStart,
    required this.periodEnd,
    required this.netAmount,
    required this.grossAmount,
    required this.deductions,
    required this.status,
    required this.displayStatus,
    this.baseSalaryAmount,
    this.bonusAmount,
    this.overtimeAmount,
    this.automaticDeductionsAmount,
    this.manualDeductionsAmount,
    this.paidAt,
    this.deductionLines = const [],
  });

  factory PayslipRead.fromJson(Map<String, dynamic> json) {
    final lines = json['deduction_lines'];
    return PayslipRead(
      id: json['id'] as int,
      periodStart: json['period_start'] as String,
      periodEnd: json['period_end'] as String,
      netAmount: json['net_amount']?.toString() ?? '0',
      grossAmount: json['gross_amount']?.toString() ?? '0',
      deductions: json['deductions']?.toString() ?? '0',
      status: json['status'] as String? ?? 'draft',
      displayStatus: json['display_status'] as String? ??
          json['status'] as String? ??
          'draft',
      baseSalaryAmount: json['base_salary_amount']?.toString(),
      bonusAmount: json['bonus_amount']?.toString(),
      overtimeAmount: json['overtime_amount']?.toString(),
      automaticDeductionsAmount:
          json['automatic_deductions_amount']?.toString(),
      manualDeductionsAmount: json['manual_deductions_amount']?.toString(),
      paidAt: json['paid_at'] as String?,
      deductionLines: lines is List
          ? lines
              .whereType<Map<String, dynamic>>()
              .map(PayslipDeductionLine.fromJson)
              .toList()
          : const [],
    );
  }

  final int id;
  final String periodStart;
  final String periodEnd;
  final String netAmount;
  final String grossAmount;
  final String deductions;
  final String status;
  final String displayStatus;
  final String? baseSalaryAmount;
  final String? bonusAmount;
  final String? overtimeAmount;
  final String? automaticDeductionsAmount;
  final String? manualDeductionsAmount;
  final String? paidAt;
  final List<PayslipDeductionLine> deductionLines;

  DateTime get periodStartDate => DateTime.parse(periodStart);

  int get year => periodStartDate.year;

  int get month => periodStartDate.month;

  bool get isEmployeeVisible {
    if (status == 'draft' || displayStatus == 'draft') return false;
    return displayStatus == 'approved' || displayStatus == 'paid';
  }
}

class PayslipListResponse {
  const PayslipListResponse({required this.items, required this.total});

  factory PayslipListResponse.fromJson(Map<String, dynamic> json) {
    final items = json['items'];
    return PayslipListResponse(
      items: items is List
          ? items
              .whereType<Map<String, dynamic>>()
              .map(PayslipRead.fromJson)
              .toList()
          : const [],
      total: json['total'] as int? ?? 0,
    );
  }

  final List<PayslipRead> items;
  final int total;
}

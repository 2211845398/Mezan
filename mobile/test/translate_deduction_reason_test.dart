import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/payroll/lib/translate_deduction_reason.dart';

void main() {
  test('translateDeductionReason localizes absence and late in Arabic', () {
    expect(
      translateDeductionReason('Absence', isArabic: true),
      'غياب',
    );
    expect(
      formatDeductionLineLabel(
        reason: 'Absence',
        isArabic: true,
        date: '2026-05-03',
      ),
      'غياب (2026-05-03)',
    );
    expect(
      translateDeductionReason('Late arrival', isArabic: true),
      'تأخير arrival',
    );
  });

  test('translateDeductionReason leaves English unchanged', () {
    expect(
      translateDeductionReason('Absence', isArabic: false),
      'Absence',
    );
  });
}

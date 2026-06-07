import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/format/format_date.dart';
import 'package:mobile/core/format/format_leave.dart';
import 'package:mobile/core/format/format_money.dart';
import 'package:mobile/core/format/latin_digits.dart';

void main() {
  group('formatMoney', () {
    test('formats amount with symbol', () {
      final text = formatMoney(1250.5, currencySymbol: 'LYD');
      expect(text, contains('1'));
      expect(text, contains('LYD'));
    });

    test('uses Latin digits even when ar locale is passed', () {
      final text = formatMoney(99, locale: 'ar', currencySymbol: '');
      expect(text, contains('99'));
      expect(text, isNot(contains('٩')));
    });
  });

  group('formatDate', () {
    test('formats ISO-style date', () {
      final text = formatDate(DateTime(2026, 6, 5));
      expect(text, '2026-06-05');
    });

    test('formatDateTime includes time', () {
      final text = formatDateTime(DateTime(2026, 6, 5, 14, 30));
      expect(text, contains('2026-06-05'));
      expect(text, contains('14'));
    });

    test('formatRelativeAttendanceDate shows Today for same day', () {
      final now = DateTime(2026, 6, 6, 15);
      final text = formatRelativeAttendanceDate(
        DateTime(2026, 6, 6, 9),
        arabic: false,
        reference: now,
      );
      expect(text, 'Today');
    });

    test('formatRelativeAttendanceDate shows date only when older', () {
      final now = DateTime(2026, 6, 6);
      final text = formatRelativeAttendanceDate(
        DateTime(2026, 5, 20),
        arabic: false,
        reference: now,
      );
      expect(text, '2026-05-20');
    });
  });

  group('formatLeaveDays', () {
    test('rounds decimal strings to int', () {
      expect(formatLeaveDays('21.00'), '21');
      expect(formatLeaveDays('5.7'), '6');
    });
  });

  group('toLatinDigits', () {
    test('converts Eastern Arabic numerals', () {
      expect(toLatinDigits('٦ يونيو ٢٠٢٦'), '6 يونيو 2026');
    });
  });
}

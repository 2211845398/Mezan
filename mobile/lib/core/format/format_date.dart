import 'package:intl/intl.dart';

import 'format_time.dart';
import 'latin_digits.dart';

/// Date formatting with Latin digits regardless of UI locale.
String formatDate(
  DateTime date, {
  String pattern = 'yyyy-MM-dd',
  String locale = 'en',
}) {
  return toLatinDigits(DateFormat(pattern, 'en').format(date.toLocal()));
}

String formatDateTime(
  DateTime date, {
  String pattern = 'yyyy-MM-dd HH:mm',
  String locale = 'en',
}) {
  return toLatinDigits(DateFormat(pattern, 'en').format(date.toLocal()));
}

/// Relative label for recent attendance; older dates show date only (no time).
String formatRelativeAttendanceDate(
  DateTime date, {
  required bool arabic,
  DateTime? reference,
}) {
  final local = date.toLocal();
  final now = (reference ?? DateTime.now()).toLocal();
  final today = DateTime(now.year, now.month, now.day);
  final target = DateTime(local.year, local.month, local.day);
  final diff = today.difference(target).inDays;

  if (diff == 0) {
    return arabic ? 'اليوم' : 'Today';
  }
  if (diff == 1) {
    return arabic ? 'أمس' : 'Yesterday';
  }
  if (diff > 1 && diff < 7) {
    return weekdayLabel(_dartWeekdayToPython(local.weekday), arabic: arabic);
  }
  return formatDate(local);
}

int _dartWeekdayToPython(int dartWeekday) {
  return dartWeekday == DateTime.sunday ? 6 : dartWeekday - 1;
}

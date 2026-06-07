/// Format API time strings (`HH:mm:ss` or `HH:mm`) for display.
String formatApiTime(String raw) {
  final parts = raw.split(':');
  if (parts.length >= 2) {
    return '${parts[0]}:${parts[1]}';
  }
  return raw;
}

const _weekdayNamesEn = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const _weekdayNamesAr = [
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
  'الأحد',
];

/// ISO weekday display order starting Friday (common in GCC): Fri=4 … Thu=3.
const kWeekDisplayOrderFromFriday = [4, 5, 6, 0, 1, 2, 3];

String weekdayLabel(int pythonWeekday, {required bool arabic}) {
  final names = arabic ? _weekdayNamesAr : _weekdayNamesEn;
  if (pythonWeekday < 0 || pythonWeekday >= names.length) return '';
  return names[pythonWeekday];
}

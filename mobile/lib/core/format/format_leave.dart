/// Format leave balance values as whole-day integers for display.
String formatLeaveDays(Object? value) {
  if (value == null) return '—';
  if (value is int) return value.toString();
  final parsed = double.tryParse(value.toString());
  if (parsed == null) return value.toString();
  return parsed.round().toString();
}

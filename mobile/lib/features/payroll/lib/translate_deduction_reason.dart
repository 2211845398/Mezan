/// Localizes automatic deduction reason labels from API English strings.
String translateDeductionReason(String rawReason, {required bool isArabic}) {
  if (!isArabic) return rawReason;

  var result = rawReason;
  if (result.toLowerCase().contains('absence')) {
    result = result.replaceAll(
      RegExp('absence', caseSensitive: false),
      'غياب',
    );
  }
  if (result.toLowerCase().contains('late')) {
    result = result.replaceAll(
      RegExp('late', caseSensitive: false),
      'تأخير',
    );
  }
  return result;
}

String formatDeductionLineLabel({
  required String reason,
  required bool isArabic,
  String? date,
}) {
  final label = translateDeductionReason(reason, isArabic: isArabic);
  if (date != null && date.isNotEmpty) {
    return '$label ($date)';
  }
  return label;
}

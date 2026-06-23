import '../i18n/app_strings.dart';

/// Localize one normalized API validation item (`code`, `field`, `path`, …).
String localizedApiValidationMessage(
  String localeCode,
  Map<String, dynamic> item,
) {
  final strings = AppStrings(localeCode);
  final code = item['code'] as String? ?? '';
  final field = item['field'] as String? ?? '';

  switch (code) {
    case 'required':
      return strings.fieldRequired;
    case 'invalid_email':
      return strings.loginEmailInvalid;
    case 'min_length':
      return strings.requiredPasswordTooShort;
    case 'invalid_value':
    case 'invalid_type':
      break;
  }

  if (field == 'email' || field.endsWith('.email')) {
    return strings.loginEmailInvalid;
  }
  if (field == 'password' || field.endsWith('.password')) {
    return strings.loginPasswordRequired;
  }

  final msg = item['msg'];
  if (msg is String && msg.trim().isNotEmpty) {
    return msg.trim();
  }
  return strings.fieldRequired;
}

String? firstApiValidationMessage(
  String localeCode,
  List<dynamic>? errors,
) {
  if (errors == null || errors.isEmpty) return null;
  final first = errors.first;
  if (first is Map<String, dynamic>) {
    return localizedApiValidationMessage(localeCode, first);
  }
  return null;
}

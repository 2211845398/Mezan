import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/i18n/app_strings.dart';
import 'package:mobile/core/validation/validation_messages.dart';

void main() {
  group('localizedApiValidationMessage', () {
    test('maps required code to fieldRequired', () {
      final strings = AppStrings('ar');
      final msg = localizedApiValidationMessage('ar', {
        'code': 'required',
        'field': 'email',
        'path': 'email',
      });
      expect(msg, strings.fieldRequired);
    });

    test('maps invalid_email code', () {
      final strings = AppStrings('en');
      final msg = localizedApiValidationMessage('en', {
        'code': 'invalid_email',
        'field': 'email',
      });
      expect(msg, strings.loginEmailInvalid);
    });
  });
}

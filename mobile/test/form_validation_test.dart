import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/i18n/app_strings.dart';
import 'package:mobile/core/validation/form_validation.dart';

void main() {
  group('FormValidation', () {
    test('firstError returns first failing check message', () {
      final strings = AppStrings('en');
      final message = FormValidation.firstError([
        FormValidation.required('', strings.fieldRequired),
        FormValidation.required('ok', strings.fieldRequired),
      ]);
      expect(message, strings.fieldRequired);
    });

    test('email check requires non-empty valid address', () {
      final strings = AppStrings('ar');
      final missing = FormValidation.email(
        '',
        requiredMessage: strings.loginEmailRequired,
        invalidMessage: strings.loginEmailInvalid,
      );
      expect(missing.ok, isFalse);
      expect(missing.message, strings.loginEmailRequired);

      final invalid = FormValidation.email(
        'not-an-email',
        requiredMessage: strings.loginEmailRequired,
        invalidMessage: strings.loginEmailInvalid,
      );
      expect(invalid.ok, isFalse);
      expect(invalid.message, strings.loginEmailInvalid);
    });
  });
}

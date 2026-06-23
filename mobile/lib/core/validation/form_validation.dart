typedef ValidationCheck = ({bool ok, String message});

/// Submit-time form validation helpers. Screens render [firstError] with an inline alert.
abstract final class FormValidation {
  static String? firstError(List<ValidationCheck> checks) {
    for (final check in checks) {
      if (!check.ok) return check.message;
    }
    return null;
  }

  static ValidationCheck required(String? value, String message) => (
        ok: value != null && value.trim().isNotEmpty,
        message: message,
      );

  static ValidationCheck email(
    String? value, {
    required String requiredMessage,
    required String invalidMessage,
  }) {
    final trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) {
      return (ok: false, message: requiredMessage);
    }
    if (!trimmed.contains('@')) {
      return (ok: false, message: invalidMessage);
    }
    return (ok: true, message: '');
  }

  static ValidationCheck minLength(String? value, int min, String message) => (
        ok: (value?.trim().length ?? 0) >= min,
        message: message,
      );

  static ValidationCheck matches(String? a, String? b, String message) => (
        ok: (a ?? '').trim() == (b ?? '').trim(),
        message: message,
      );
}

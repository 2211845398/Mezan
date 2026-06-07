class ApiException implements Exception {
  ApiException({
    required this.message,
    this.statusCode,
    this.code,
  });

  final String message;
  final int? statusCode;
  final String? code;

  bool get isUnauthorized => statusCode == 401;

  bool get isPasswordChangeRequired =>
      statusCode == 403 && message.contains('password_change_required');

  @override
  String toString() => 'ApiException($statusCode): $message';
}

import 'dart:convert';

class AttendanceQrPayload {
  const AttendanceQrPayload({
    required this.qrPayload,
    required this.expiresInSeconds,
    required this.branchId,
    required this.deviceId,
  });

  static const _v2Prefix = 'mezan:attendance:v2:';

  final String qrPayload;
  final int expiresInSeconds;
  final int branchId;
  final int deviceId;

  factory AttendanceQrPayload.fromJson(Map<String, dynamic> json) {
    return AttendanceQrPayload(
      qrPayload: json['qr_payload'] as String,
      expiresInSeconds: json['expires_in_seconds'] as int,
      branchId: json['branch_id'] as int,
      deviceId: json['device_id'] as int,
    );
  }

  int? get tokenVersion => parseTokenVersion(qrPayload);

  DateTime? get expiresAt => parseExpiresAt(qrPayload);

  static int? parseTokenVersion(String qrPayload) {
    final map = _decodeV2Payload(qrPayload);
    final ver = map?['ver'];
    return ver is int ? ver : int.tryParse('$ver');
  }

  static DateTime? parseExpiresAt(String qrPayload) {
    final map = _decodeV2Payload(qrPayload);
    final exp = map?['exp'];
    final seconds = exp is int ? exp : int.tryParse('$exp');
    if (seconds == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true);
  }

  static Map<String, dynamic>? _decodeV2Payload(String qrPayload) {
    if (!qrPayload.startsWith(_v2Prefix)) return null;
    final body = qrPayload.substring(_v2Prefix.length);
    final dot = body.lastIndexOf('.');
    if (dot <= 0) return null;
    try {
      final encoded = body.substring(0, dot);
      final normalized = base64Url.normalize(encoded);
      final jsonStr = utf8.decode(base64Url.decode(normalized));
      final decoded = jsonDecode(jsonStr);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }
}

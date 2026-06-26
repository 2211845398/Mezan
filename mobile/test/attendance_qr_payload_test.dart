import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/attendance_kiosk/models/attendance_qr_payload.dart';

void main() {
  test('parses attendance QR payload from API JSON', () {
    final model = AttendanceQrPayload.fromJson({
      'qr_payload': 'mezan:attendance:v2:abc.sig',
      'expires_in_seconds': 90,
      'branch_id': 1,
      'device_id': 2,
    });
    expect(model.qrPayload, contains('mezan:attendance:v2:'));
    expect(model.expiresInSeconds, 90);
    expect(model.branchId, 1);
    expect(model.deviceId, 2);
  });

  test('parses token version and expiry from signed v2 payload', () {
    final inner = base64Url.encode(
      utf8.encode(
        '{"type":"attendance","branch_id":3,"device_id":7,"ver":4,"exp":1893456000}',
      ),
    );
    final qr = 'mezan:attendance:v2:$inner.fake-sig';

    expect(AttendanceQrPayload.parseTokenVersion(qr), 4);
    expect(
      AttendanceQrPayload.parseExpiresAt(qr),
      DateTime.fromMillisecondsSinceEpoch(1893456000 * 1000, isUtc: true),
    );
  });
}

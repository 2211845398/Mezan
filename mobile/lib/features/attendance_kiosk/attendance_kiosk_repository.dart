import '../../core/api/api_client.dart';
import 'models/attendance_qr_payload.dart';

class AttendanceKioskRepository {
  AttendanceKioskRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<AttendanceQrPayload> fetchCurrentQr() async {
    final data = await _api.getMap('/attendance-devices/me/qr');
    return AttendanceQrPayload.fromJson(data);
  }
}

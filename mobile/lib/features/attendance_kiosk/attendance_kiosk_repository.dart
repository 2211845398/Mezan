import '../../core/api/api_exception.dart';
import '../../core/api/api_client.dart';
import 'kiosk_device_storage.dart';
import 'models/attendance_qr_payload.dart';

class AttendanceKioskRepository {
  AttendanceKioskRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<AttendanceQrPayload> generateQr() async {
    try {
      final data = await _api.postMap('/attendance-devices/me/qr/generate');
      final payload = AttendanceQrPayload.fromJson(data);
      await KioskDeviceStorage.saveDeviceId(payload.deviceId);
      return payload;
    } on ApiException catch (e) {
      if (e.statusCode == 403 || e.statusCode == 404) {
        await KioskDeviceStorage.clear();
      }
      rethrow;
    }
  }
}

import '../../../core/api/api_client.dart';
import 'models/dashboard_models.dart';

class EmployeeSelfServiceRepository {
  EmployeeSelfServiceRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<List<WeeklyScheduleRead>> getMySchedules() async {
    final data = await _api.getJson('/employees/me/schedules');
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(WeeklyScheduleRead.fromJson)
        .toList();
  }

  Future<VacationLeaveBalanceRead?> getMyLeaveBalance() async {
    final data = await _api.getMap('/employees/me/leave-balance');
    return VacationLeaveBalanceRead.fromJson(data);
  }

  Future<List<AttendanceLogRead>> getMyAttendance({int limit = 30}) async {
    final data = await _api.getJson(
      '/employees/me/attendance',
      queryParameters: {'limit': limit},
    );
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(AttendanceLogRead.fromJson)
        .toList();
  }

  Future<void> requestAttendanceQr() async {
    await _api.postMap('/employees/me/attendance/request-qr');
  }

  Future<AttendanceLogRead> clockIn({required String qrPayload}) async {
    final data = await _api.postMap(
      '/employees/me/attendance/clock-in',
      data: {'qr_payload': qrPayload},
    );
    return AttendanceLogRead.fromJson(data);
  }

  Future<AttendanceLogRead> clockOut({required String qrPayload}) async {
    final data = await _api.postMap(
      '/employees/me/attendance/clock-out',
      data: {'qr_payload': qrPayload},
    );
    return AttendanceLogRead.fromJson(data);
  }
}

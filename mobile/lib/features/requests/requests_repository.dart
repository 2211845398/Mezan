import '../../../core/api/api_client.dart';
import 'models/leave_request.dart';

class RequestsRepository {
  RequestsRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<LeaveBalanceRead?> getLeaveBalance() async {
    final data = await _api.getMap('/employees/me/leave-balance');
    return LeaveBalanceRead.fromJson(data);
  }

  Future<List<LeaveRequestRead>> getMyLeaveRequests() async {
    final data = await _api.getJson('/employees/me/leave-requests');
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(LeaveRequestRead.fromJson)
        .toList();
  }

  Future<LeaveRequestRead> submitLeaveRequest({
    required String leaveType,
    required String startDate,
    required String endDate,
    String? reason,
  }) async {
    final data = await _api.postMap(
      '/employees/me/leave-requests',
      data: {
        'leave_type': leaveType,
        'start_date': startDate,
        'end_date': endDate,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );
    return LeaveRequestRead.fromJson(data);
  }

  Future<HrFeedbackRead> submitFeedback({
    required String message,
    String? category,
  }) async {
    final data = await _api.postMap(
      '/hr/feedback',
      data: {
        'message': message.trim(),
        if (category != null) 'category': category,
      },
    );
    return HrFeedbackRead.fromJson(data);
  }

  Future<List<HrFeedbackRead>> getMyFeedback() async {
    final data = await _api.getJson('/hr/feedback/me');
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(HrFeedbackRead.fromJson)
        .toList();
  }
}

import '../../core/api/api_client.dart';
import 'models/correspondence_thread.dart';

class CorrespondenceRepository {
  CorrespondenceRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<List<CorrespondenceThreadRead>> listMyThreads() async {
    final data = await _api.getJson('/correspondence/threads/me');
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(CorrespondenceThreadRead.fromJson)
        .toList();
  }

  Future<CorrespondenceThreadDetail> getThread(int id) async {
    final data = await _api.getMap('/correspondence/threads/$id');
    return CorrespondenceThreadDetail.fromJson(data);
  }

  Future<CorrespondenceThreadRead> createThread({
    required String subject,
    required String requestType,
    required String targetRoleCode,
    required String body,
  }) async {
    final data = await _api.postMap(
      '/correspondence/threads',
      data: {
        'subject': subject,
        'request_type': requestType,
        'target_role_code': targetRoleCode,
        'body': body,
      },
    );
    return CorrespondenceThreadRead.fromJson(data);
  }

  Future<void> postMessage({
    required int threadId,
    required String body,
  }) async {
    await _api.postVoid(
      '/correspondence/threads/$threadId/messages',
      data: {'body': body},
    );
  }
}

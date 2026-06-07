import '../../../core/api/api_client.dart';
import 'models/employee_profile.dart';

class ProfileRepository {
  ProfileRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<EmployeeProfileRead> getMyProfile() async {
    final data = await _api.getMap('/employees/me/profile');
    return EmployeeProfileRead.fromJson(data);
  }

  Future<void> updatePreferredLanguage(String languageCode) async {
    await _api.patch<Map<String, dynamic>>(
      '/auth/me',
      data: {'preferred_language': languageCode},
    );
  }
}

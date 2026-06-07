import '../../core/api/api_client.dart';
import '../../core/api/token_storage.dart';
import 'models/branch_brief.dart';
import 'models/login_result.dart';
import 'models/user_read.dart';

class AuthRepository {
  AuthRepository({
    required ApiClient apiClient,
    required TokenStorage tokenStorage,
  })  : _api = apiClient,
        _tokens = tokenStorage;

  final ApiClient _api;
  final TokenStorage _tokens;

  Future<LoginResult> login({
    required String email,
    required String password,
  }) async {
    final data = await _api.postMap(
      '/auth/login',
      data: {'email': email.trim(), 'password': password},
    );
    final requires2fa = data['requires_2fa'] == true;
    final challenge = data['challenge_token'] as String?;
    if (requires2fa && challenge != null && challenge.isNotEmpty) {
      return LoginResult(requires2fa: true, challengeToken: challenge);
    }

    final access = data['access_token'] as String?;
    final refresh = data['refresh_token'] as String?;
    if (access == null || refresh == null) {
      throw StateError('missing_tokens');
    }
    _tokens.setAccessToken(access);
    await _tokens.writeRefreshToken(refresh);
    return LoginResult(
      accessToken: access,
      refreshToken: refresh,
      mustChangePassword: data['must_change_password'] == true,
    );
  }

  Future<LoginResult> verifyTwoFactor({
    required String challengeToken,
    required String code,
  }) async {
    final data = await _api.postMap(
      '/auth/2fa/verify',
      data: {'challenge_token': challengeToken, 'code': code},
    );
    final access = data['access_token'] as String?;
    final refresh = data['refresh_token'] as String?;
    if (access == null || refresh == null) {
      throw StateError('missing_tokens');
    }
    _tokens.setAccessToken(access);
    await _tokens.writeRefreshToken(refresh);
    return LoginResult(
      accessToken: access,
      refreshToken: refresh,
      mustChangePassword: data['must_change_password'] == true,
    );
  }

  Future<UserRead> changeRequiredPassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final data = await _api.postMap(
      '/auth/change-password-required',
      data: {
        'current_password': currentPassword,
        'new_password': newPassword,
      },
    );
    return UserRead.fromJson(data);
  }

  Future<void> requestPasswordReset(String email) async {
    await _api.postVoid(
      '/auth/password-reset/request',
      data: {'email': email.trim()},
    );
  }

  Future<void> confirmPasswordReset({
    required String token,
    required String newPassword,
  }) async {
    await _api.postVoid(
      '/auth/password-reset/confirm',
      data: {'token': token, 'new_password': newPassword},
    );
  }

  Future<UserRead> toggleTwoFactor({
    required bool enabled,
    required String currentPassword,
  }) async {
    final data = await _api.patch<Map<String, dynamic>>(
      '/auth/me/two-factor',
      data: {'enabled': enabled, 'current_password': currentPassword},
    );
    return UserRead.fromJson(data);
  }

  Future<String?> refreshSession() async {
    final refresh = await _tokens.readRefreshToken();
    if (refresh == null || refresh.isEmpty) return null;
    final data = await _api.postMap(
      '/auth/refresh',
      data: {'refresh_token': refresh},
    );
    final access = data['access_token'] as String;
    _tokens.setAccessToken(access);
    return access;
  }

  Future<void> logout() async {
    final refresh = await _tokens.readRefreshToken();
    try {
      if (refresh != null && refresh.isNotEmpty) {
        await _api.postVoid(
          '/auth/logout',
          data: {'refresh_token': refresh},
        );
      }
    } finally {
      await _tokens.clearAll();
    }
  }

  Future<UserRead> getMe() async {
    final data = await _api.getMap('/auth/me');
    return UserRead.fromJson(data);
  }

  Future<UserRead> updateMe(Map<String, dynamic> body) async {
    final data = await _api.patch<Map<String, dynamic>>('/auth/me', data: body);
    return UserRead.fromJson(data);
  }

  Future<UserRead> uploadAvatar(List<int> bytes, String filename) async {
    final data = await _api.postMultipartMap(
      '/auth/me/avatar',
      fieldName: 'file',
      bytes: bytes,
      filename: filename,
    );
    return UserRead.fromJson(data);
  }

  Future<BranchBrief> getMyBranch() async {
    final data = await _api.getMap('/auth/me/branch');
    return BranchBrief.fromJson(data);
  }

  Future<List<String>> getMyRoleCodes() async {
    final data = await _api.getMap('/auth/me/roles');
    final codes = data['codes'];
    if (codes is List) {
      return codes.map((e) => e.toString()).toList();
    }
    return const [];
  }

  Future<Set<String>> getMyPermissions() async {
    final data = await _api.getJson('/auth/me/permissions');
    final set = <String>{};
    if (data is! List) return set;
    for (final item in data) {
      if (item is Map<String, dynamic>) {
        final resource = item['resource'] as String?;
        final action = item['action'] as String?;
        if (resource != null && action != null) {
          set.add('$resource:$action');
        }
      }
    }
    return set;
  }
}

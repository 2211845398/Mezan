import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Refresh token in secure storage; access token stays in memory only (web parity).
class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  static const _refreshKey = 'mezan.auth.refresh';

  final FlutterSecureStorage _storage;
  String? _accessToken;

  String? get accessToken => _accessToken;

  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  Future<void> writeRefreshToken(String token) =>
      _storage.write(key: _refreshKey, value: token);

  Future<void> clearRefreshToken() => _storage.delete(key: _refreshKey);

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  Future<void> clearAll() async {
    _accessToken = null;
    await clearRefreshToken();
  }
}

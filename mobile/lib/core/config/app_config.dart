import 'dart:io';

import 'package:flutter/foundation.dart';

/// Runtime API configuration (override with `--dart-define=API_BASE_URL=...`).
abstract final class AppConfig {
  static const _defineBaseUrl = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    if (_defineBaseUrl.isNotEmpty) return _defineBaseUrl;
    if (kIsWeb) {
      return 'http://localhost:8000/api/v1';
    }
    if (Platform.isAndroid) {
      return 'http://10.0.2.2:8000/api/v1';
    }
    return 'http://127.0.0.1:8000/api/v1';
  }
}

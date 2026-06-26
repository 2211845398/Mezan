import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_config.dart';

void main() {
  test('apiBaseUrl is non-empty', () {
    expect(AppConfig.apiBaseUrl, isNotEmpty);
    expect(AppConfig.apiBaseUrl, endsWith('/api/v1'));
  });
}

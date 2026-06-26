import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Global test setup: in-memory SharedPreferences for locale/theme prefs.
Future<void> testExecutable(Future<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});
  await initializeDateFormatting('en');
  await initializeDateFormatting('ar');
  await testMain();
}

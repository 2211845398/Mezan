import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persists the attendance kiosk device id for QR polling (option C).
class KioskDeviceStorage {
  KioskDeviceStorage._();

  static const _key = 'mezan.attendance.kiosk_device_id';
  static const devDefaultDeviceId = 1;

  static Future<int> resolveDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getInt(_key);
    if (cached != null && cached > 0) return cached;
    if (kDebugMode) return devDefaultDeviceId;
    throw StateError('Attendance kiosk device is not configured');
  }

  static Future<void> saveDeviceId(int id) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_key, id);
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}

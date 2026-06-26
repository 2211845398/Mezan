import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'models/employee_profile.dart';

class ProfileCache {
  ProfileCache._();

  static const _key = 'mezan_employee_profile_cache';

  static Future<void> save(EmployeeProfileRead profile) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(profile.toJson()));
  }

  static Future<EmployeeProfileRead?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return EmployeeProfileRead.fromJson(map);
    } catch (_) {
      return null;
    }
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}

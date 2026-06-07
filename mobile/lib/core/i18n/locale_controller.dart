import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LocaleController extends ChangeNotifier {
  LocaleController({Locale? initial}) : _locale = initial ?? const Locale('ar');

  static const _prefKey = 'mezan_locale';

  Locale _locale;

  Locale get locale => _locale;

  bool get isArabic => _locale.languageCode == 'ar';

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_prefKey);
    if (code == 'en' || code == 'ar') {
      _locale = Locale(code!);
      notifyListeners();
    }
  }

  Future<void> setLocale(Locale locale) async {
    if (_locale == locale) return;
    _locale = locale;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, locale.languageCode);
  }

  Future<void> toggleLanguage() {
    return setLocale(isArabic ? const Locale('en') : const Locale('ar'));
  }
}

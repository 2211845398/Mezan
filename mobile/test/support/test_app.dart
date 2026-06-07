import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

import 'package:mobile/core/i18n/locale_controller.dart';
import 'package:mobile/core/i18n/theme_mode_controller.dart';
import 'package:mobile/core/theme/mezan_theme.dart';

/// Wraps a widget with Mezan theme, localization, and optional [Provider]s.
Future<void> pumpMezanWidget(
  WidgetTester tester,
  Widget child, {
  List<SingleChildWidget> providers = const [],
  Locale locale = const Locale('en'),
  ThemeMode themeMode = ThemeMode.light,
}) async {
  final localeController = LocaleController(initial: locale);
  final themeModeController = ThemeModeController();
  if (themeMode != ThemeMode.system) {
    await themeModeController.setMode(themeMode);
  }

  final isArabic = locale.languageCode.startsWith('ar');
  final light = applyMezanExtension(MezanTheme.light(isArabic: isArabic), isArabic: isArabic);
  final dark = applyMezanExtension(MezanTheme.dark(isArabic: isArabic), isArabic: isArabic);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: localeController),
        ChangeNotifierProvider.value(value: themeModeController),
        ...providers,
      ],
      child: MaterialApp(
        locale: locale,
        theme: light,
        darkTheme: dark,
        themeMode: themeMode,
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('ar'), Locale('en')],
        home: Directionality(
          textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
          child: Scaffold(body: child),
        ),
      ),
    ),
  );
  await tester.pump();
}

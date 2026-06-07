import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import '../core/i18n/locale_controller.dart';
import '../core/i18n/theme_mode_controller.dart';
import '../core/theme/mezan_scroll_behavior.dart';
import '../core/theme/mezan_theme.dart';
import 'router.dart';

class MezanApp extends StatelessWidget {
  const MezanApp({super.key});

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<LocaleController>();
    final themeMode = context.watch<ThemeModeController>();
    final isArabic = locale.isArabic;

    final light = applyMezanExtension(MezanTheme.light(isArabic: isArabic), isArabic: isArabic);
    final dark = applyMezanExtension(MezanTheme.dark(isArabic: isArabic), isArabic: isArabic);

    return AppRouterScope(
      child: Builder(
        builder: (context) {
          final router = RouterScope.of(context);
          return MaterialApp.router(
            title: 'Mezan',
            debugShowCheckedModeBanner: false,
            scrollBehavior: const MezanScrollBehavior(),
            locale: locale.locale,
            supportedLocales: const [
              Locale('ar'),
              Locale('en'),
            ],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            themeMode: themeMode.mode,
            theme: light,
            darkTheme: dark,
            routerConfig: router,
            builder: (context, child) {
              return Directionality(
                textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
                child: child ?? const SizedBox.shrink(),
              );
            },
          );
        },
      ),
    );
  }
}

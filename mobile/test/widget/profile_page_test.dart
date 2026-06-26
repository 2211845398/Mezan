import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/api/token_storage.dart';
import 'package:mobile/features/auth/auth_repository.dart';
import 'package:mobile/features/auth/auth_session.dart';
import 'package:mobile/features/auth/models/user_read.dart';
import 'package:mobile/core/i18n/locale_controller.dart';
import 'package:mobile/core/i18n/theme_mode_controller.dart';
import 'package:mobile/features/profile/profile_controller.dart';
import 'package:mobile/features/profile/profile_page.dart';
import 'package:mobile/features/profile/profile_repository.dart';
import 'package:provider/provider.dart';

import '../support/test_app.dart';
import '../support/test_controllers.dart';

void main() {
  testWidgets('profile toggles language and theme mode', (tester) async {
    final storage = TokenStorage();
    final api = ApiClient(tokenStorage: storage);
    final profile = TestProfileController(ProfileRepository(apiClient: api));
    final session = AuthSession(
      repository: AuthRepository(apiClient: api, tokenStorage: storage),
    );
    session.status = AuthStatus.authenticated;
    session.user = const UserRead(
      id: 1,
      email: 'e@t.com',
      status: 'active',
      employeeProfileId: 1,
    );
    await pumpMezanWidget(
      tester,
      const ProfilePage(),
      locale: const Locale('en'),
      providers: [
        ChangeNotifierProvider<AuthSession>.value(value: session),
        ChangeNotifierProvider<ProfileController>.value(value: profile),
        Provider<ProfileRepository>(
          create: (_) => ProfileRepository(apiClient: api),
        ),
      ],
    );
    await tester.pumpAndSettle();

    final pageElement = tester.element(find.byType(ProfilePage));
    final locale = Provider.of<LocaleController>(pageElement, listen: false);
    final themeMode = Provider.of<ThemeModeController>(pageElement, listen: false);

    expect(find.text('Digital badge'), findsOneWidget);
    expect(find.text('Employee ID: 1'), findsNothing);
    expect(find.text('Edit profile'), findsOneWidget);

    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    expect(themeMode.mode, ThemeMode.dark);

    await tester.tap(find.text('Arabic'));
    await tester.pumpAndSettle();
    expect(locale.isArabic, isTrue);
  });
}

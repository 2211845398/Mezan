import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../shared/widgets/mezan_logo_loader.dart';
import 'auth_session.dart';
import 'login_page.dart';
import 'required_password_change_page.dart';
import 'two_factor_verify_page.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<AuthSession>();

    if (session.isBooting) {
      final strings = AppStrings(Localizations.localeOf(context).languageCode);
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: MezanLogoLoader(label: strings.loading),
          ),
        ),
      );
    }

    if (session.requires2faStep) {
      return const TwoFactorVerifyPage();
    }

    if (!session.isAuthenticated) {
      return const LoginPage();
    }

    if (session.requiresPasswordChangeStep) {
      return const RequiredPasswordChangePage();
    }

    return child;
  }
}

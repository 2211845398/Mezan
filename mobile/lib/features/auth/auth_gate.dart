import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../shared/widgets/mezan_loading_state.dart';
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
      return const Scaffold(
        body: SafeArea(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: MezanLoadingState(useShimmer: false),
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

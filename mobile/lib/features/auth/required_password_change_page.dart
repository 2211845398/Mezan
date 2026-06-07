import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_notify.dart';
import '../../shared/widgets/mezan_text_field.dart';
import 'auth_session.dart';

class RequiredPasswordChangePage extends StatefulWidget {
  const RequiredPasswordChangePage({super.key});

  @override
  State<RequiredPasswordChangePage> createState() =>
      _RequiredPasswordChangePageState();
}

class _RequiredPasswordChangePageState extends State<RequiredPasswordChangePage> {
  final _current = TextEditingController();
  final _newPw = TextEditingController();
  final _confirm = TextEditingController();
  var _submitting = false;

  @override
  void dispose() {
    _current.dispose();
    _newPw.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    if (_newPw.text.length < 8) {
      MezanNotify.error(context, strings.requiredPasswordTooShort);
      return;
    }
    if (_newPw.text != _confirm.text) {
      MezanNotify.error(context, strings.profilePasswordMismatch);
      return;
    }
    setState(() => _submitting = true);
    await context.read<AuthSession>().completeRequiredPasswordChange(
          currentPassword: _current.text,
          newPassword: _newPw.text,
        );
    if (!mounted) return;
    setState(() => _submitting = false);
    final error = context.read<AuthSession>().lastError;
    if (error != null) {
      MezanNotify.error(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final ext = MezanThemeExtension.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: MezanCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    strings.requiredPasswordTitle,
                    style: Theme.of(context).textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    strings.requiredPasswordSubtitle,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: ext.mutedForeground,
                        ),
                  ),
                  const SizedBox(height: 20),
                  MezanTextField(
                    controller: _current,
                    label: strings.profileCurrentPassword,
                    obscureText: true,
                  ),
                  const SizedBox(height: 12),
                  MezanTextField(
                    controller: _newPw,
                    label: strings.profileNewPassword,
                    obscureText: true,
                  ),
                  const SizedBox(height: 12),
                  MezanTextField(
                    controller: _confirm,
                    label: strings.profileConfirmPassword,
                    obscureText: true,
                  ),
                  const SizedBox(height: 16),
                  MezanButton(
                    label: strings.requiredPasswordSubmit,
                    expand: true,
                    loading: _submitting,
                    onPressed: _submitting ? null : _submit,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_notify.dart';
import '../../shared/widgets/mezan_otp_input.dart';
import 'auth_repository.dart';
import 'password_reset_new_password_page.dart';

class PasswordResetOtpPage extends StatefulWidget {
  const PasswordResetOtpPage({super.key, required this.challengeToken});

  final String challengeToken;

  @override
  State<PasswordResetOtpPage> createState() => _PasswordResetOtpPageState();
}

class _PasswordResetOtpPageState extends State<PasswordResetOtpPage> {
  var _code = '';
  var _submitting = false;

  Future<void> _submit() async {
    if (_code.length != 6) return;
    setState(() => _submitting = true);
    try {
      final resetToken = await context.read<AuthRepository>().verifyResetOtp(
            challengeToken: widget.challengeToken,
            code: _code,
          );
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => PasswordResetNewPasswordPage(resetToken: resetToken),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      MezanNotify.error(
        context,
        AppStrings(Localizations.localeOf(context).languageCode).resetOtpInvalid,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final ext = MezanThemeExtension.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(strings.resetOtpTitle)),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: MezanCard(
                radius: MezanCardRadius.hero,
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      strings.resetOtpSubtitle,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: ext.mutedForeground,
                          ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      strings.resetOtpCodeLabel,
                      style: Theme.of(context).textTheme.labelLarge,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    MezanOtpInput(
                      enabled: !_submitting,
                      onChanged: (value) => setState(() => _code = value),
                      onCompleted: (_) => _submit(),
                    ),
                    const SizedBox(height: 20),
                    MezanButton(
                      label: strings.resetOtpSubmit,
                      expand: true,
                      loading: _submitting,
                      onPressed: _submitting || _code.length != 6 ? null : _submit,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

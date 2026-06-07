import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_notify.dart';
import '../../shared/widgets/mezan_text_field.dart';
import 'auth_repository.dart';

class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  final _emailController = TextEditingController();
  var _submitting = false;
  var _sent = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) return;
    setState(() => _submitting = true);
    try {
      await context.read<AuthRepository>().requestPasswordReset(email);
      if (!mounted) return;
      setState(() => _sent = true);
    } catch (_) {
      if (!mounted) return;
      MezanNotify.error(
        context,
        AppStrings(Localizations.localeOf(context).languageCode).forgotPasswordFailed,
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
      appBar: AppBar(title: Text(strings.forgotPasswordTitle)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: MezanCard(
            child: _sent
                ? Text(
                    strings.forgotPasswordSent,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: ext.mutedForeground,
                        ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(strings.forgotPasswordSubtitle),
                      const SizedBox(height: 16),
                      MezanTextField(
                        controller: _emailController,
                        label: strings.loginEmail,
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 16),
                      MezanButton(
                        label: strings.forgotPasswordSubmit,
                        expand: true,
                        loading: _submitting,
                        onPressed: _submitting ? null : _submit,
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

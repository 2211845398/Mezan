import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/validation/form_validation.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_text_field.dart';
import '../../shared/widgets/mezan_validation_alert.dart';
import 'auth_repository.dart';
import 'password_reset_otp_page.dart';

class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  final _emailController = TextEditingController();
  var _submitting = false;
  String? _validationError;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final validationError = FormValidation.firstError([
      FormValidation.email(
        _emailController.text,
        requiredMessage: strings.loginEmailRequired,
        invalidMessage: strings.loginEmailInvalid,
      ),
    ]);
    if (validationError != null) {
      setState(() => _validationError = validationError);
      return;
    }
    setState(() {
      _submitting = true;
      _validationError = null;
    });
    try {
      final challengeToken =
          await context.read<AuthRepository>().requestPasswordReset(
                _emailController.text.trim(),
              );
      if (!mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => PasswordResetOtpPage(challengeToken: challengeToken),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _validationError = strings.forgotPasswordFailed);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);

    return Scaffold(
      appBar: AppBar(title: Text(strings.forgotPasswordTitle)),
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
                    MezanTextField(
                      controller: _emailController,
                      label: strings.loginEmail,
                      keyboardType: TextInputType.emailAddress,
                    ),
                    const SizedBox(height: 16),
                    if (_validationError != null) ...[
                      MezanValidationAlert(message: _validationError!),
                      const SizedBox(height: 12),
                    ],
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
        ),
      ),
    );
  }
}

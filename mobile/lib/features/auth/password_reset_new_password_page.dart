import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_notify.dart';
import '../../shared/widgets/mezan_text_field.dart';
import '../../shared/widgets/mezan_validation_alert.dart';
import 'auth_repository.dart';

class PasswordResetNewPasswordPage extends StatefulWidget {
  const PasswordResetNewPasswordPage({super.key, required this.resetToken});

  final String resetToken;

  @override
  State<PasswordResetNewPasswordPage> createState() =>
      _PasswordResetNewPasswordPageState();
}

class _PasswordResetNewPasswordPageState extends State<PasswordResetNewPasswordPage> {
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  var _submitting = false;
  var _obscurePassword = true;
  var _obscureConfirm = true;
  String? _validationError;

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final password = _passwordController.text;
    final confirm = _confirmController.text;
    final strings = AppStrings(Localizations.localeOf(context).languageCode);

    if (password.length < 8) {
      setState(() => _validationError = strings.requiredPasswordTooShort);
      return;
    }
    if (password != confirm) {
      setState(() => _validationError = strings.profilePasswordMismatch);
      return;
    }

    setState(() {
      _submitting = true;
      _validationError = null;
    });
    try {
      await context.read<AuthRepository>().confirmPasswordReset(
            resetToken: widget.resetToken,
            newPassword: password,
          );
      if (!mounted) return;
      MezanNotify.success(context, strings.resetNewPasswordSuccess);
      Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (_) {
      if (!mounted) return;
      setState(() => _validationError = strings.resetNewPasswordFailed);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final ext = MezanThemeExtension.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(strings.resetNewPasswordTitle)),
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
                      controller: _passwordController,
                      label: strings.resetNewPasswordLabel,
                      obscureText: _obscurePassword,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          color: ext.mutedForeground,
                        ),
                        tooltip: _obscurePassword
                            ? strings.loginShowPassword
                            : strings.loginHidePassword,
                        onPressed: () =>
                            setState(() => _obscurePassword = !_obscurePassword),
                      ),
                    ),
                    const SizedBox(height: 16),
                    MezanTextField(
                      controller: _confirmController,
                      label: strings.resetConfirmPasswordLabel,
                      obscureText: _obscureConfirm,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscureConfirm
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          color: ext.mutedForeground,
                        ),
                        tooltip: _obscureConfirm
                            ? strings.loginShowPassword
                            : strings.loginHidePassword,
                        onPressed: () =>
                            setState(() => _obscureConfirm = !_obscureConfirm),
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (_validationError != null) ...[
                      MezanValidationAlert(message: _validationError!),
                      const SizedBox(height: 12),
                    ],
                    MezanButton(
                      label: strings.resetNewPasswordSubmit,
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

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../core/validation/form_validation.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_text_field.dart';
import '../../shared/widgets/mezan_validation_alert.dart';
import 'auth_session.dart';

class TwoFactorVerifyPage extends StatefulWidget {
  const TwoFactorVerifyPage({super.key});

  @override
  State<TwoFactorVerifyPage> createState() => _TwoFactorVerifyPageState();
}

class _TwoFactorVerifyPageState extends State<TwoFactorVerifyPage> {
  final _codeController = TextEditingController();
  var _submitting = false;
  String? _validationError;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final validationError = FormValidation.firstError([
      FormValidation.minLength(
        _codeController.text.trim(),
        6,
        strings.twoFactorCodeRequired,
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
    await context.read<AuthSession>().verifyTwoFactor(_codeController.text.trim());
    if (!mounted) return;
    setState(() => _submitting = false);
    final error = context.read<AuthSession>().lastError;
    if (error != null) {
      setState(() => _validationError = strings.twoFactorInvalid);
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
                    strings.twoFactorTitle,
                    style: Theme.of(context).textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    strings.twoFactorSubtitle,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: ext.mutedForeground,
                        ),
                  ),
                  const SizedBox(height: 20),
                  MezanTextField(
                    controller: _codeController,
                    label: strings.twoFactorCodeLabel,
                    keyboardType: TextInputType.number,
                  ),
                  const SizedBox(height: 16),
                  if (_validationError != null) ...[
                    MezanValidationAlert(message: _validationError!),
                    const SizedBox(height: 12),
                  ],
                  MezanButton(
                    label: strings.twoFactorSubmit,
                    expand: true,
                    loading: _submitting,
                    onPressed: _submitting ? null : _submit,
                  ),
                  TextButton(
                    onPressed: () => context.read<AuthSession>().signOut(),
                    child: Text(strings.signOut),
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

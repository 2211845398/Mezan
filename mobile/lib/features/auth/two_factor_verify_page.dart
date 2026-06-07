import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_notify.dart';
import '../../shared/widgets/mezan_text_field.dart';
import 'auth_session.dart';

class TwoFactorVerifyPage extends StatefulWidget {
  const TwoFactorVerifyPage({super.key});

  @override
  State<TwoFactorVerifyPage> createState() => _TwoFactorVerifyPageState();
}

class _TwoFactorVerifyPageState extends State<TwoFactorVerifyPage> {
  final _codeController = TextEditingController();
  var _submitting = false;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _codeController.text.trim();
    if (code.length != 6) return;
    setState(() => _submitting = true);
    await context.read<AuthSession>().verifyTwoFactor(code);
    if (!mounted) return;
    setState(() => _submitting = false);
    final error = context.read<AuthSession>().lastError;
    if (error != null) {
      MezanNotify.error(
        context,
        AppStrings(Localizations.localeOf(context).languageCode).twoFactorInvalid,
      );
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

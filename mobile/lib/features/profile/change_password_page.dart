import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/validation/form_validation.dart';
import '../../features/auth/auth_repository.dart';
import '../../features/auth/auth_session.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_notify.dart';
import '../../shared/widgets/mezan_text_field.dart';
import '../../shared/widgets/mezan_validation_alert.dart';
import 'models/profile_update.dart';

class ChangePasswordPage extends StatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  State<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends State<ChangePasswordPage> {
  final _current = TextEditingController();
  final _newPw = TextEditingController();
  final _confirm = TextEditingController();
  var _saving = false;
  String? _validationError;

  @override
  void dispose() {
    _current.dispose();
    _newPw.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final newPw = _newPw.text.trim();
    final validationError = FormValidation.firstError([
      FormValidation.required(_current.text, strings.loginPasswordRequired),
      FormValidation.minLength(newPw, 8, strings.requiredPasswordTooShort),
      FormValidation.matches(
        newPw,
        _confirm.text.trim(),
        strings.profilePasswordMismatch,
      ),
    ]);
    if (validationError != null) {
      setState(() => _validationError = validationError);
      return;
    }

    setState(() {
      _saving = true;
      _validationError = null;
    });

    try {
      final authRepo = context.read<AuthRepository>();
      final session = context.read<AuthSession>();
      await authRepo.updateMe(
        ProfileUpdate(
          currentPassword: _current.text,
          newPassword: newPw,
        ).toJson(),
      );
      if (!mounted) return;
      await session.refreshUser();
      if (!mounted) return;
      MezanNotify.success(context, strings.profilePasswordUpdated);
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _validationError = e is ApiException ? e.message : strings.errorNetwork;
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);

    return Scaffold(
      appBar: AppBar(title: Text(strings.profileChangePassword)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanCard(
            child: Column(
              children: [
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
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_validationError != null) ...[
            MezanValidationAlert(message: _validationError!),
            const SizedBox(height: 12),
          ],
          MezanButton(
            label: strings.profileChangePassword,
            expand: true,
            loading: _saving,
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
    );
  }
}

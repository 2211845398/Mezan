import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/i18n/app_strings.dart';
import '../../features/auth/auth_repository.dart';
import '../../features/auth/auth_session.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_text_field.dart';
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
  String? _error;

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
    if (newPw.length < 8) {
      setState(() => _error = strings.requiredPasswordTooShort);
      return;
    }
    if (newPw != _confirm.text.trim()) {
      setState(() => _error = strings.profilePasswordMismatch);
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await context.read<AuthRepository>().updateMe(
            ProfileUpdate(
              currentPassword: _current.text,
              newPassword: newPw,
            ).toJson(),
          );
      await context.read<AuthSession>().refreshUser();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(strings.profilePasswordUpdated)),
      );
      Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = e is ApiException ? e.message : 'Network error';
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
          if (_error != null) ...[
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            const SizedBox(height: 12),
          ],
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

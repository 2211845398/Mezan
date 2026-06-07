import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/i18n/locale_controller.dart';
import '../../features/auth/auth_repository.dart';
import '../../features/auth/auth_session.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_text_field.dart';
import 'models/profile_update.dart';
import 'profile_controller.dart';

class ProfileEditPage extends StatefulWidget {
  const ProfileEditPage({super.key});

  @override
  State<ProfileEditPage> createState() => _ProfileEditPageState();
}

class _ProfileEditPageState extends State<ProfileEditPage> {
  final _formKey = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _fatherName = TextEditingController();
  final _familyName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _city = TextEditingController();
  var _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthSession>().user;
    if (user != null) {
      _firstName.text = user.firstName ?? '';
      _fatherName.text = user.fatherName ?? '';
      _familyName.text = user.familyName ?? '';
      _email.text = user.email;
      _phone.text = user.phone ?? '';
      _city.text = user.city ?? '';
    }
  }

  @override
  void dispose() {
    _firstName.dispose();
    _fatherName.dispose();
    _familyName.dispose();
    _email.dispose();
    _phone.dispose();
    _city.dispose();
    super.dispose();
  }

  static bool _isLibyanMobile(String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length != 10) return false;
    if (!digits.startsWith('09')) return false;
    final operator = int.tryParse(digits[2]);
    return operator != null && operator >= 1 && operator <= 5;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final authRepo = context.read<AuthRepository>();
      final session = context.read<AuthSession>();
      final locale = context.read<LocaleController>();

      final phoneRaw = _phone.text.trim();
      final body = ProfileUpdate(
        email: _email.text.trim(),
        firstName: _firstName.text.trim().isEmpty ? null : _firstName.text.trim(),
        fatherName:
            _fatherName.text.trim().isEmpty ? null : _fatherName.text.trim(),
        familyName:
            _familyName.text.trim().isEmpty ? null : _familyName.text.trim(),
        phone: phoneRaw.isEmpty ? null : phoneRaw,
        city: _city.text.trim().isEmpty ? null : _city.text.trim(),
        preferredLanguage: locale.locale.languageCode,
      );

      await authRepo.updateMe(body.toJson());
      await session.refreshUser();
      await context.read<ProfileController>().load();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(strings.profileEditSaved)),
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
      appBar: AppBar(
        title: Text(strings.profileEditTitle),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (_error != null) ...[
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            const SizedBox(height: 12),
          ],
          MezanCard(
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  MezanTextField(
                    controller: _firstName,
                    label: strings.profileFirstName,
                  ),
                  const SizedBox(height: 12),
                  MezanTextField(
                    controller: _fatherName,
                    label: strings.profileFatherName,
                  ),
                  const SizedBox(height: 12),
                  MezanTextField(
                    controller: _familyName,
                    label: strings.profileFamilyName,
                  ),
                  const SizedBox(height: 12),
                  MezanTextField(
                    controller: _email,
                    label: strings.profileEmail,
                    keyboardType: TextInputType.emailAddress,
                    validator: (v) {
                      final email = v?.trim() ?? '';
                      if (email.isEmpty || !email.contains('@')) {
                        return strings.profileEmailInvalid;
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  MezanTextField(
                    controller: _phone,
                    label: strings.profilePhone,
                    keyboardType: TextInputType.phone,
                    validator: (v) {
                      final phone = v?.trim() ?? '';
                      if (phone.isEmpty) return null;
                      if (!_isLibyanMobile(phone)) {
                        return strings.profilePhoneInvalid;
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  MezanTextField(
                    controller: _city,
                    label: strings.profileCity,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          MezanButton(
            label: strings.profileEditSave,
            expand: true,
            loading: _saving,
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
    );
  }
}

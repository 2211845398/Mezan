import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/i18n/locale_controller.dart';
import '../../core/validation/form_validation.dart';
import '../../features/auth/auth_repository.dart';
import '../../features/auth/auth_session.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_notify.dart';
import '../../shared/widgets/mezan_text_field.dart';
import '../../shared/widgets/mezan_validation_alert.dart';
import 'models/profile_update.dart';
import 'profile_controller.dart';

class ProfileEditPage extends StatefulWidget {
  const ProfileEditPage({super.key});

  @override
  State<ProfileEditPage> createState() => _ProfileEditPageState();
}

class _ProfileEditPageState extends State<ProfileEditPage> {
  final _firstName = TextEditingController();
  final _fatherName = TextEditingController();
  final _familyName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _city = TextEditingController();
  var _saving = false;
  String? _validationError;

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
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final phoneRaw = _phone.text.trim();
    final checks = <({bool ok, String message})>[
      FormValidation.email(
        _email.text,
        requiredMessage: strings.fieldRequired,
        invalidMessage: strings.profileEmailInvalid,
      ),
    ];
    if (phoneRaw.isNotEmpty && !_isLibyanMobile(phoneRaw)) {
      checks.add((ok: false, message: strings.profilePhoneInvalid));
    }
    final validationError = FormValidation.firstError(checks);
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
      final locale = context.read<LocaleController>();
      final profileController = context.read<ProfileController>();

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
      if (!mounted) return;
      await session.refreshUser();
      if (!mounted) return;
      await profileController.load();

      if (!mounted) return;
      MezanNotify.success(context, strings.profileEditSaved);
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
      appBar: AppBar(
        title: Text(strings.profileEditTitle),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          MezanCard(
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
                ),
                const SizedBox(height: 12),
                MezanTextField(
                  controller: _phone,
                  label: strings.profilePhone,
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                MezanTextField(
                  controller: _city,
                  label: strings.profileCity,
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

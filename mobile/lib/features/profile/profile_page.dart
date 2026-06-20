import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_exception.dart';
import '../../core/config/api_urls.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/theme_mode_controller.dart';
import '../../core/theme/mezan_theme.dart';
import '../../features/auth/auth_repository.dart';
import '../../features/auth/auth_session.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_empty_state.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import '../../shared/widgets/mezan_text_field.dart';
import 'models/employee_profile.dart';
import 'profile_controller.dart';
import 'profile_cache.dart';
import 'change_password_page.dart';
import 'profile_edit_page.dart';
import 'profile_repository.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (context.read<AuthSession>().hasEmployeeProfile) {
        context.read<ProfileController>().load();
      }
    });
  }

  Future<void> _toggleLanguage(LocaleController locale) async {
    await locale.toggleLanguage();
    if (!mounted) return;
    try {
      await context.read<ProfileRepository>().updatePreferredLanguage(
            locale.locale.languageCode,
          );
    } catch (_) {
      // Local language still applies; server sync is best-effort.
    }
  }

  String _themeModeLabel(AppStrings strings, ThemeMode mode) {
    return switch (mode) {
      ThemeMode.light => strings.themeLight,
      ThemeMode.dark => strings.themeDark,
      ThemeMode.system => strings.themeSystem,
    };
  }

  Future<void> _showThemePicker(
    ThemeModeController themeMode,
    AppStrings strings,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.brightness_auto_outlined),
              title: Text(strings.themeSystem),
              trailing: themeMode.mode == ThemeMode.system
                  ? Icon(Icons.check, color: Theme.of(ctx).colorScheme.secondary)
                  : null,
              onTap: () async {
                await themeMode.setMode(ThemeMode.system);
                if (ctx.mounted) Navigator.of(ctx).pop();
              },
            ),
            ListTile(
              leading: const Icon(Icons.light_mode_outlined),
              title: Text(strings.themeLight),
              trailing: themeMode.mode == ThemeMode.light
                  ? Icon(Icons.check, color: Theme.of(ctx).colorScheme.secondary)
                  : null,
              onTap: () async {
                await themeMode.setMode(ThemeMode.light);
                if (ctx.mounted) Navigator.of(ctx).pop();
              },
            ),
            ListTile(
              leading: const Icon(Icons.dark_mode_outlined),
              title: Text(strings.themeDark),
              trailing: themeMode.mode == ThemeMode.dark
                  ? Icon(Icons.check, color: Theme.of(ctx).colorScheme.secondary)
                  : null,
              onTap: () async {
                await themeMode.setMode(ThemeMode.dark);
                if (ctx.mounted) Navigator.of(ctx).pop();
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _onTwoFactorToggle(bool enabled) async {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final session = context.read<AuthSession>();
    final passwordController = TextEditingController();
    var submitting = false;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: SafeArea(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      strings.profileTwoFactorTitle,
                      style: Theme.of(ctx).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      strings.profileTwoFactorPasswordPrompt,
                      style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(
                            color: MezanThemeExtension.of(ctx).mutedForeground,
                          ),
                    ),
                    const SizedBox(height: 16),
                    MezanTextField(
                      controller: passwordController,
                      label: strings.profileCurrentPassword,
                      obscureText: true,
                    ),
                    const SizedBox(height: 16),
                    MezanButton(
                      label: strings.profileTwoFactorConfirm,
                      expand: true,
                      loading: submitting,
                      onPressed: submitting
                          ? null
                          : () async {
                              if (passwordController.text.isEmpty) {
                                ScaffoldMessenger.of(ctx).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      strings.profileTwoFactorPasswordHint,
                                    ),
                                  ),
                                );
                                return;
                              }
                              setSheetState(() => submitting = true);
                              try {
                                await session.toggleTwoFactor(
                                  enabled: enabled,
                                  currentPassword: passwordController.text,
                                );
                                if (!ctx.mounted) return;
                                Navigator.of(ctx).pop(true);
                              } catch (e) {
                                if (!ctx.mounted) return;
                                final message = e is ApiException
                                    ? e.message
                                    : strings.profileTwoFactorFailed;
                                ScaffoldMessenger.of(ctx).showSnackBar(
                                  SnackBar(content: Text(message)),
                                );
                                setSheetState(() => submitting = false);
                              }
                            },
                    ),
                    const SizedBox(height: 8),
                    MezanButton(
                      label: strings.profileTwoFactorCancel,
                      variant: MezanButtonVariant.outline,
                      expand: true,
                      onPressed: submitting
                          ? null
                          : () => Navigator.of(ctx).pop(false),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    passwordController.dispose();

    if (!mounted || confirmed != true) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          enabled
              ? strings.profileTwoFactorEnabled
              : strings.profileTwoFactorDisabled,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final locale = context.watch<LocaleController>();
    final themeMode = context.watch<ThemeModeController>();
    final session = context.watch<AuthSession>();
    final controller = context.watch<ProfileController>();
    final ext = MezanThemeExtension.of(context);
    final scheme = Theme.of(context).colorScheme;

    if (!session.hasEmployeeProfile) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanEmptyState(
            title: strings.noEmployeeProfileTitle,
            message: strings.noEmployeeProfileBody,
            icon: Icons.person_outline,
          ),
        ],
      );
    }

    if (controller.isLoading && controller.profile == null) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: MezanLoadingState(),
      );
    }

    if (controller.state == ProfileLoadState.error && controller.profile == null) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanErrorState(
            message: controller.errorMessage,
            onRetry: controller.load,
          ),
        ],
      );
    }

    final profile = controller.profile;

    return ListView(
      padding: const EdgeInsets.all(16),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        if (controller.errorMessage != null && profile != null) ...[
          MezanErrorState(message: controller.errorMessage),
          const SizedBox(height: 12),
        ],
        if (profile != null)
          _IdentityCard(profile: profile, strings: strings, ext: ext),
        const SizedBox(height: 12),
        MezanButton(
          label: strings.profileEditTitle,
          icon: Icons.edit_outlined,
          variant: MezanButtonVariant.outline,
          expand: true,
          onPressed: () {
            Navigator.of(context).push<void>(
              MaterialPageRoute(builder: (_) => const ProfileEditPage()),
            );
          },
        ),
        const SizedBox(height: 12),
        MezanCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                strings.profileSettingsTitle,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.language, color: scheme.secondary),
                title: Text(strings.profilePreferredLanguage),
                subtitle: Text(
                  locale.isArabic
                      ? strings.languageArabic
                      : strings.languageEnglish,
                ),
                onTap: () => _toggleLanguage(locale),
              ),
              const Divider(height: 24),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.palette_outlined, color: scheme.secondary),
                title: Text(strings.profileThemeMode),
                subtitle: Text(_themeModeLabel(strings, themeMode.mode)),
                onTap: () => _showThemePicker(themeMode, strings),
              ),
              const Divider(height: 24),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.lock_outline, color: scheme.secondary),
                title: Text(strings.profileChangePassword),
                onTap: () {
                  Navigator.of(context).push<void>(
                    MaterialPageRoute(builder: (_) => const ChangePasswordPage()),
                  );
                },
              ),
              const Divider(height: 24),
              Text(
                strings.profileTwoFactorTitle,
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(strings.profileTwoFactorEnable),
                value: session.user?.twoFactorEnabled ?? false,
                onChanged: (enabled) => _onTwoFactorToggle(enabled),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        MezanButton(
          label: strings.signOut,
          variant: MezanButtonVariant.outline,
          expand: true,
          onPressed: () async {
            await ProfileCache.clear();
            await session.signOut();
          },
        ),
      ],
    );
  }
}

class _IdentityCard extends StatefulWidget {
  const _IdentityCard({
    required this.profile,
    required this.strings,
    required this.ext,
  });

  final EmployeeProfileRead profile;
  final AppStrings strings;
  final MezanThemeExtension ext;

  @override
  State<_IdentityCard> createState() => _IdentityCardState();
}

class _IdentityCardState extends State<_IdentityCard> {
  final _picker = ImagePicker();
  var _uploading = false;

  Future<void> _pickAndUpload(ImageSource source) async {
    Navigator.of(context).pop();
    final picked = await _picker.pickImage(
      source: source,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    final authRepo = context.read<AuthRepository>();
    final profileController = context.read<ProfileController>();

    setState(() => _uploading = true);
    try {
      final bytes = await picked.readAsBytes();
      final filename = picked.name.isNotEmpty ? picked.name : 'avatar.jpg';
      await authRepo.uploadAvatar(bytes, filename);
      await profileController.load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(widget.strings.profileAvatarUploadSuccess)),
      );
    } catch (e) {
      if (!mounted) return;
      final message = e is ApiException
          ? e.message
          : widget.strings.profileAvatarUploadFailed;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _showUploadOptions() {
    if (_uploading) return;
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(widget.strings.profileAvatarFromGallery),
              onTap: () => _pickAndUpload(ImageSource.gallery),
            ),
            if (!kIsWeb)
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: Text(widget.strings.profileAvatarFromCamera),
                onTap: () => _pickAndUpload(ImageSource.camera),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.profile;
    final ext = widget.ext;
    final avatarUrl = resolveApiAssetUrl(profile.avatarUrl);

    return MezanCard(
      radius: MezanCardRadius.hero,
      child: Column(
        children: [
          GestureDetector(
            onTap: _showUploadOptions,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: ext.muted,
                  backgroundImage:
                      avatarUrl.isNotEmpty ? NetworkImage(avatarUrl) : null,
                  child: avatarUrl.isEmpty
                      ? Icon(Icons.person, size: 40, color: ext.foreground)
                      : null,
                ),
                if (_uploading)
                  const Positioned.fill(
                    child: CircleAvatar(
                      radius: 40,
                      backgroundColor: Color(0x88000000),
                      child: SizedBox(
                        width: 28,
                        height: 28,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  )
                else
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: CircleAvatar(
                      radius: 14,
                      backgroundColor: Theme.of(context).colorScheme.secondary,
                      child: const Icon(Icons.camera_alt, size: 16),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            profile.fullName,
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
          if (profile.email != null && profile.email!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              profile.email!,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: ext.mutedForeground,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

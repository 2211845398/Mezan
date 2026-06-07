import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show Locale;

import '../../core/api/api_exception.dart';
import '../../core/i18n/locale_controller.dart';
import 'auth_repository.dart';
import 'models/branch_brief.dart';
import 'models/login_result.dart';
import 'models/user_read.dart';

enum AuthStatus { booting, unauthenticated, authenticated }

class AuthSession extends ChangeNotifier {
  AuthSession({
    required AuthRepository repository,
    LocaleController? localeController,
  })  : _repository = repository,
        _localeController = localeController;

  final AuthRepository _repository;
  final LocaleController? _localeController;

  AuthStatus status = AuthStatus.booting;
  UserRead? user;
  BranchBrief? branch;
  List<String> roleCodes = const [];
  Set<String> permissions = const {};
  String? lastError;
  String? pending2faChallenge;
  bool needsPasswordChange = false;
  String? twoFactorPasswordBuffer;

  bool get isAuthenticated => status == AuthStatus.authenticated;

  bool get isBooting => status == AuthStatus.booting;

  bool get requires2faStep =>
      pending2faChallenge != null && pending2faChallenge!.isNotEmpty;

  bool get requiresPasswordChangeStep =>
      isAuthenticated && (needsPasswordChange || (user?.mustChangePassword ?? false));

  bool get isFloorStaff => roleCodes.contains('FLOOR_STAFF');

  bool get isAttendanceKiosk => hasPermission('attendance_kiosk', 'read');

  String? get employeeName => user?.displayName;

  String? get branchName => branch?.name ?? user?.branchName;

  bool get hasEmployeeProfile => user?.hasEmployeeProfile ?? false;

  bool hasPermission(String resource, String action) {
    return permissions.contains('$resource:$action');
  }

  Future<void> bootstrap() async {
    status = AuthStatus.booting;
    lastError = null;
    pending2faChallenge = null;
    notifyListeners();

    try {
      final refresh = await _repository.refreshSession();
      if (refresh == null) {
        status = AuthStatus.unauthenticated;
        notifyListeners();
        return;
      }
      await _loadSessionContext(full: false);
      needsPasswordChange = user?.mustChangePassword ?? false;
      status = AuthStatus.authenticated;
    } on ApiException catch (e) {
      if (e.isPasswordChangeRequired) {
        try {
          user = await _repository.getMe();
          needsPasswordChange = true;
          status = AuthStatus.authenticated;
        } catch (_) {
          await _repository.logout();
          status = AuthStatus.unauthenticated;
        }
      } else {
        await _repository.logout();
        status = AuthStatus.unauthenticated;
      }
    } catch (_) {
      status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    lastError = null;
    pending2faChallenge = null;
    notifyListeners();

    try {
      final result = await _repository.login(email: email, password: password);
      if (result.requires2fa) {
        pending2faChallenge = result.challengeToken;
        status = AuthStatus.unauthenticated;
        notifyListeners();
        return;
      }
      await _applyLoginResult(result, full: true);
    } on ApiException catch (e) {
      if (e.isPasswordChangeRequired) {
        try {
          user = await _repository.getMe();
          needsPasswordChange = true;
          status = AuthStatus.authenticated;
          lastError = null;
        } catch (_) {
          lastError = e.message;
          status = AuthStatus.unauthenticated;
        }
      } else {
        lastError = e.message;
        status = AuthStatus.unauthenticated;
      }
    } catch (_) {
      lastError = 'Network error';
      status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<void> verifyTwoFactor(String code) async {
    lastError = null;
    final challenge = pending2faChallenge;
    if (challenge == null) {
      lastError = 'missing_challenge';
      notifyListeners();
      return;
    }
    try {
      final result = await _repository.verifyTwoFactor(
        challengeToken: challenge,
        code: code.trim(),
      );
      pending2faChallenge = null;
      await _applyLoginResult(result, full: true);
    } on ApiException catch (e) {
      if (e.isPasswordChangeRequired) {
        try {
          user = await _repository.getMe();
          needsPasswordChange = true;
          status = AuthStatus.authenticated;
          lastError = null;
        } catch (_) {
          lastError = e.message;
        }
      } else {
        lastError = e.message;
      }
    } catch (_) {
      lastError = 'Network error';
    }
    notifyListeners();
  }

  Future<void> completeRequiredPasswordChange({
    required String currentPassword,
    required String newPassword,
  }) async {
    lastError = null;
    try {
      user = await _repository.changeRequiredPassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
      needsPasswordChange = false;
      await _loadSessionContext(full: true);
    } on ApiException catch (e) {
      lastError = e.message;
    } catch (_) {
      lastError = 'Network error';
    }
    notifyListeners();
  }

  Future<void> toggleTwoFactor({
    required bool enabled,
    required String currentPassword,
  }) async {
    user = await _repository.toggleTwoFactor(
      enabled: enabled,
      currentPassword: currentPassword,
    );
    notifyListeners();
  }

  Future<void> signOut() async {
    await _repository.logout();
    user = null;
    branch = null;
    roleCodes = const [];
    permissions = const {};
    pending2faChallenge = null;
    needsPasswordChange = false;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  void handleSessionExpired() {
    user = null;
    branch = null;
    roleCodes = const [];
    permissions = const {};
    pending2faChallenge = null;
    needsPasswordChange = false;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<void> refreshUser() async {
    user = await _repository.getMe();
    needsPasswordChange = user?.mustChangePassword ?? false;
    notifyListeners();
  }

  Future<void> _applyLoginResult(LoginResult result, {required bool full}) async {
    needsPasswordChange = result.mustChangePassword;
    await _loadSessionContext(full: full && !needsPasswordChange);
    if (needsPasswordChange && user == null) {
      user = await _repository.getMe();
    }
    status = AuthStatus.authenticated;
  }

  Future<void> _loadSessionContext({required bool full}) async {
    final me = await _repository.getMe();
    user = me;
    needsPasswordChange = me.mustChangePassword;

    if (!full) {
      return;
    }

    final rolesFuture = _repository.getMyRoleCodes();
    final permsFuture = _repository.getMyPermissions();
    BranchBrief? branchBrief;
    try {
      branchBrief = await _repository.getMyBranch();
    } catch (_) {
      branchBrief = null;
    }

    roleCodes = await rolesFuture;
    permissions = await permsFuture;
    branch = branchBrief;

    final lang = me.preferredLanguage;
    if (lang != null && (lang == 'ar' || lang == 'en')) {
      await _localeController?.setLocale(Locale(lang));
    }
  }
}

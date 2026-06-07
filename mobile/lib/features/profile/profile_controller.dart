import 'package:flutter/foundation.dart';

import '../../core/api/api_exception.dart';
import 'models/employee_profile.dart';
import 'profile_cache.dart';
import 'profile_repository.dart';

enum ProfileLoadState { idle, loading, ready, error }

class ProfileController extends ChangeNotifier {
  ProfileController({required ProfileRepository repository})
      : _repository = repository;

  final ProfileRepository _repository;

  ProfileLoadState state = ProfileLoadState.idle;
  String? errorMessage;
  EmployeeProfileRead? profile;

  bool get isLoading => state == ProfileLoadState.loading;

  EmployeeProfileRead? get badgeProfile => profile;

  Future<void> load() async {
    if (profile == null) {
      final cached = await ProfileCache.load();
      if (cached != null) {
        profile = cached;
        state = ProfileLoadState.ready;
        notifyListeners();
      } else {
        state = ProfileLoadState.loading;
        errorMessage = null;
        notifyListeners();
      }
    }

    try {
      final loaded = await _repository.getMyProfile();
      profile = loaded;
      await ProfileCache.save(loaded);
      state = ProfileLoadState.ready;
      errorMessage = null;
    } catch (e) {
      if (profile == null) {
        state = ProfileLoadState.error;
        errorMessage = e is ApiException ? e.message : 'Network error';
      } else {
        errorMessage = e is ApiException ? e.message : null;
      }
    }
    notifyListeners();
  }
}

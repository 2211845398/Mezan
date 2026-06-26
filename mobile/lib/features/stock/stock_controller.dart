import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_exception.dart';
import '../auth/models/branch_brief.dart';
import 'models/stock_finder_result.dart';
import 'stock_repository.dart';

enum StockSearchState { idle, loading, ready, empty, error }

class StockController extends ChangeNotifier {
  StockController({required StockRepository repository})
      : _repository = repository;

  final StockRepository _repository;

  StockSearchState state = StockSearchState.idle;
  String? errorMessage;
  String lastQuery = '';
  List<StockFinderResult> results = const [];
  StockFinderResult? selected;
  List<BranchBrief> branches = const [];
  int? selectedBranchId;
  List<StockFinderResult> suggestions = const [];
  var isSuggesting = false;

  Timer? _suggestDebounce;

  bool get isLoading => state == StockSearchState.loading;

  Future<void> loadBranches({int? defaultBranchId}) async {
    try {
      branches = await _repository.listBranches();
      if (branches.isEmpty) {
        selectedBranchId = defaultBranchId;
      } else if (defaultBranchId != null &&
          branches.any((b) => b.id == defaultBranchId)) {
        selectedBranchId = defaultBranchId;
      } else {
        selectedBranchId = branches.first.id;
      }
    } catch (_) {
      selectedBranchId = defaultBranchId;
    }
    notifyListeners();
  }

  void setSelectedBranch(int? branchId) {
    selectedBranchId = branchId;
    notifyListeners();
  }

  void onQueryChanged(String query) {
    _suggestDebounce?.cancel();
    final q = query.trim();
    if (q.length < 2) {
      suggestions = const [];
      isSuggesting = false;
      notifyListeners();
      return;
    }

    isSuggesting = true;
    notifyListeners();

    _suggestDebounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        suggestions = await _repository.search(
          query: q,
          branchId: selectedBranchId,
          limit: 8,
        );
      } catch (_) {
        suggestions = const [];
      }
      isSuggesting = false;
      notifyListeners();
    });
  }

  void clearSuggestions() {
    _suggestDebounce?.cancel();
    suggestions = const [];
    isSuggesting = false;
    notifyListeners();
  }

  Future<void> search(String query, {int? branchId}) async {
    final q = query.trim();
    if (q.isEmpty) {
      _reset();
      notifyListeners();
      return;
    }

    clearSuggestions();
    lastQuery = q;
    state = StockSearchState.loading;
    errorMessage = null;
    selected = null;
    notifyListeners();

    final effectiveBranchId = branchId ?? selectedBranchId;

    try {
      final found = await _repository.search(
        query: q,
        branchId: effectiveBranchId,
      );
      results = found;
      if (found.isEmpty) {
        state = StockSearchState.empty;
      } else {
        selected = found.length == 1 ? found.first : null;
        state = StockSearchState.ready;
      }
    } catch (e) {
      state = StockSearchState.error;
      errorMessage = e is ApiException ? e.message : 'Network error';
      results = const [];
    }
    notifyListeners();
  }

  void selectResult(StockFinderResult result) {
    selected = result;
    clearSuggestions();
    notifyListeners();
  }

  void clearSelection() {
    selected = null;
    notifyListeners();
  }

  void _reset() {
    lastQuery = '';
    results = const [];
    selected = null;
    state = StockSearchState.idle;
    errorMessage = null;
  }

  @override
  void dispose() {
    _suggestDebounce?.cancel();
    super.dispose();
  }
}

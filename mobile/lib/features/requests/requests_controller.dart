import 'package:flutter/foundation.dart';

import '../../core/api/api_exception.dart';
import 'models/leave_request.dart';
import 'requests_repository.dart';

enum RequestsLoadState { idle, loading, ready, error }

class RequestsController extends ChangeNotifier {
  RequestsController({required RequestsRepository repository})
      : _repository = repository;

  final RequestsRepository _repository;

  RequestsLoadState state = RequestsLoadState.idle;
  String? errorMessage;
  LeaveBalanceRead? leaveBalance;
  List<LeaveRequestRead> leaveRequests = const [];
  List<HrFeedbackRead> feedbackItems = const [];
  var _submittingLeave = false;
  var _submittingFeedback = false;
  String? leaveSubmitError;
  String? feedbackSubmitError;

  static const maxPendingRequests = 2;

  bool get isLoading => state == RequestsLoadState.loading;
  bool get isSubmittingLeave => _submittingLeave;
  bool get isSubmittingFeedback => _submittingFeedback;

  int get pendingLeaveCount =>
      leaveRequests.where((r) => r.status == 'pending').length;

  int get pendingFeedbackCount =>
      feedbackItems.where((r) => r.status == 'submitted').length;

  bool get canSubmitLeave => pendingLeaveCount < maxPendingRequests;

  bool get canSubmitFeedback => pendingFeedbackCount < maxPendingRequests;

  Future<void> load() async {
    state = RequestsLoadState.loading;
    errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        _repository.getLeaveBalance(),
        _repository.getMyLeaveRequests(),
        _repository.getMyFeedback(),
      ]);
      leaveBalance = results[0] as LeaveBalanceRead?;
      leaveRequests = results[1] as List<LeaveRequestRead>;
      feedbackItems = results[2] as List<HrFeedbackRead>;
      state = RequestsLoadState.ready;
    } catch (e) {
      state = RequestsLoadState.error;
      errorMessage = e is ApiException ? e.message : 'Network error';
    }
    notifyListeners();
  }

  Future<bool> submitLeave({
    required String leaveType,
    required DateTime startDate,
    required DateTime endDate,
    String? reason,
  }) async {
    leaveSubmitError = null;
    _submittingLeave = true;
    notifyListeners();

    try {
      await _repository.submitLeaveRequest(
        leaveType: leaveType,
        startDate: _formatDate(startDate),
        endDate: _formatDate(endDate),
        reason: reason,
      );
      await load();
      return true;
    } catch (e) {
      leaveSubmitError = e is ApiException ? e.message : 'Network error';
      _submittingLeave = false;
      notifyListeners();
      return false;
    } finally {
      _submittingLeave = false;
    }
  }

  Future<bool> submitFeedback({
    required String message,
    String? category,
  }) async {
    feedbackSubmitError = null;
    _submittingFeedback = true;
    notifyListeners();

    try {
      await _repository.submitFeedback(message: message, category: category);
      await load();
      return true;
    } catch (e) {
      feedbackSubmitError = e is ApiException ? e.message : 'Network error';
      _submittingFeedback = false;
      notifyListeners();
      return false;
    } finally {
      _submittingFeedback = false;
    }
  }

  static String _formatDate(DateTime d) {
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }
}

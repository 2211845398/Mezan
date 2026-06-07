import 'package:flutter/foundation.dart';

import '../../../core/api/api_exception.dart';
import 'employee_self_service_repository.dart';
import 'models/dashboard_models.dart';

enum DashboardLoadState { idle, loading, ready, error }

class DashboardController extends ChangeNotifier {
  DashboardController({required EmployeeSelfServiceRepository repository})
      : _repository = repository;

  final EmployeeSelfServiceRepository _repository;

  DashboardLoadState state = DashboardLoadState.idle;
  String? errorMessage;
  List<WeeklyScheduleRead> schedules = const [];
  VacationLeaveBalanceRead? leaveBalance;
  List<AttendanceLogRead> attendanceLogs = const [];
  AttendanceLogRead? openShift;
  String? attendanceActionError;
  String? attendanceActionSuccess;
  var _actionBusy = false;

  bool get isLoading => state == DashboardLoadState.loading;
  bool get isBusy => _actionBusy;

  TodayAttendanceStatus get todayStatus {
    if (openShift != null) return TodayAttendanceStatus.checkedIn;
    final today = DateTime.now();
    final todayLogs = attendanceLogs.where((log) => _isSameDay(log.clockInAt, today));
    if (todayLogs.any((log) => !log.isOpen)) {
      return TodayAttendanceStatus.completed;
    }
    return TodayAttendanceStatus.notCheckedIn;
  }

  WeeklyScheduleRead? get todaySchedule {
    final weekday = _pythonWeekday(DateTime.now());
    for (final row in schedules) {
      if (row.weekday == weekday) return row;
    }
    return null;
  }

  WeeklyScheduleRead? get nextWorkSchedule {
    final weekday = _pythonWeekday(DateTime.now());
    for (var offset = 1; offset <= 7; offset++) {
      final target = (weekday + offset) % 7;
      for (final row in schedules) {
        if (row.weekday == target && !row.isDayOff) return row;
      }
    }
    return null;
  }

  AttendanceLogRead? get lastAttendanceLog {
    if (attendanceLogs.isEmpty) return null;
    return attendanceLogs.first;
  }

  Future<void> load() async {
    state = DashboardLoadState.loading;
    errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        _repository.getMySchedules(),
        _repository.getMyLeaveBalance(),
        _repository.getMyAttendance(),
      ]);
      schedules = results[0] as List<WeeklyScheduleRead>;
      leaveBalance = results[1] as VacationLeaveBalanceRead?;
      attendanceLogs = results[2] as List<AttendanceLogRead>;
      openShift = null;
      for (final log in attendanceLogs) {
        if (log.isOpen) {
          openShift = log;
          break;
        }
      }
      state = DashboardLoadState.ready;
    } catch (e) {
      state = DashboardLoadState.error;
      errorMessage = e is ApiException ? e.message : 'Network error';
    }
    notifyListeners();
  }

  Future<bool> requestAttendanceQr() async {
    attendanceActionError = null;
    _actionBusy = true;
    notifyListeners();

    try {
      await _repository.requestAttendanceQr();
      return true;
    } catch (e) {
      attendanceActionError =
          e is ApiException ? e.message : 'Network error';
      return false;
    } finally {
      _actionBusy = false;
      notifyListeners();
    }
  }

  Future<bool> submitAttendanceQr(String qrPayload) async {
    attendanceActionError = null;
    attendanceActionSuccess = null;
    _actionBusy = true;
    notifyListeners();

    try {
      if (openShift != null) {
        await _repository.clockOut(qrPayload: qrPayload);
        attendanceActionSuccess = 'clock_out';
      } else {
        await _repository.clockIn(qrPayload: qrPayload);
        attendanceActionSuccess = 'clock_in';
      }
      await load();
      return true;
    } catch (e) {
      attendanceActionError =
          e is ApiException ? e.message : 'Network error';
      _actionBusy = false;
      notifyListeners();
      return false;
    } finally {
      _actionBusy = false;
    }
  }

  void clearAttendanceFeedback() {
    attendanceActionError = null;
    attendanceActionSuccess = null;
    notifyListeners();
  }

  static int _pythonWeekday(DateTime date) {
    final dartWeekday = date.weekday;
    return dartWeekday == DateTime.sunday ? 6 : dartWeekday - 1;
  }

  static bool _isSameDay(DateTime a, DateTime b) {
    final localA = a.toLocal();
    final localB = b.toLocal();
    return localA.year == localB.year &&
        localA.month == localB.month &&
        localA.day == localB.day;
  }
}

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/api/token_storage.dart';
import 'package:mobile/features/dashboard/dashboard_controller.dart';
import 'package:mobile/features/dashboard/employee_self_service_repository.dart';
import 'package:mobile/features/dashboard/models/dashboard_models.dart';

void main() {
  group('DashboardController', () {
    late DashboardController controller;

    setUp(() {
      final storage = TokenStorage();
      controller = DashboardController(
        repository: EmployeeSelfServiceRepository(
          apiClient: ApiClient(tokenStorage: storage),
        ),
      );
    });

    test('todayStatus is checkedIn when open shift exists', () {
      controller.openShift = AttendanceLogRead(
        id: 1,
        branchId: 1,
        clockInAt: DateTime.now(),
      );
      expect(controller.todayStatus, TodayAttendanceStatus.checkedIn);
    });

    test('todayStatus completed when closed log today', () {
      final now = DateTime.now();
      controller.attendanceLogs = [
        AttendanceLogRead(
          id: 1,
          branchId: 1,
          clockInAt: now,
          clockOutAt: now.add(const Duration(hours: 8)),
        ),
      ];
      expect(controller.todayStatus, TodayAttendanceStatus.completed);
    });

    test('todayStatus notCheckedIn when no logs today', () {
      controller.attendanceLogs = [
        AttendanceLogRead(
          id: 1,
          branchId: 1,
          clockInAt: DateTime.now().subtract(const Duration(days: 2)),
          clockOutAt: DateTime.now().subtract(const Duration(days: 2, hours: -8)),
        ),
      ];
      expect(controller.todayStatus, TodayAttendanceStatus.notCheckedIn);
    });
  });
}

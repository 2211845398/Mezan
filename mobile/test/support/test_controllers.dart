import 'package:mobile/features/dashboard/dashboard_controller.dart';
import 'package:mobile/features/dashboard/employee_self_service_repository.dart';
import 'package:mobile/features/dashboard/models/dashboard_models.dart';
import 'package:mobile/features/notifications/models/notification_delivery.dart';
import 'package:mobile/features/notifications/notifications_controller.dart';
import 'package:mobile/features/payroll/models/payslip_read.dart';
import 'package:mobile/features/payroll/payroll_controller.dart';
import 'package:mobile/features/payroll/payroll_repository.dart';
import 'package:mobile/features/profile/models/employee_profile.dart';
import 'package:mobile/features/profile/profile_controller.dart';
import 'package:mobile/features/profile/profile_repository.dart';
import 'package:mobile/features/requests/requests_controller.dart';
import 'package:mobile/features/requests/requests_repository.dart';

class TestDashboardController extends DashboardController {
  TestDashboardController(EmployeeSelfServiceRepository repository)
      : super(repository: repository);

  @override
  Future<void> load() async {
    state = DashboardLoadState.ready;
    leaveBalance = const VacationLeaveBalanceRead(
      calendarYear: 2026,
      usedDays: '2',
      remainingDays: '21.00',
      entitlementDays: '10',
    );
    schedules = const [
      WeeklyScheduleRead(
        id: 1,
        weekday: 5,
        startTime: '09:00:00',
        endTime: '17:00:00',
        isDayOff: true,
        branchId: 1,
      ),
    ];
    notifyListeners();
  }
}

class TestPayrollController extends PayrollController {
  TestPayrollController(PayrollRepository repository) : super(repository: repository);

  @override
  Future<void> load() async {
    final now = DateTime.now();
    final month = now.month.toString().padLeft(2, '0');
    payslips = [
      PayslipRead(
        id: 1,
        periodStart: '${now.year}-$month-01',
        periodEnd: '${now.year}-$month-28',
        netAmount: '1200',
        grossAmount: '1500',
        deductions: '300',
        status: 'paid',
        displayStatus: 'paid',
        baseSalaryAmount: '1500',
      ),
    ];
    state = PayrollLoadState.ready;
    notifyListeners();
  }
}

class TestNotificationsController extends NotificationsController {
  TestNotificationsController({
    required super.repository,
    this.stubItems = const [],
    this.stubState = NotificationsLoadState.ready,
    this.stubError,
  });

  final List<NotificationDeliveryRead> stubItems;
  final NotificationsLoadState stubState;
  final String? stubError;

  @override
  Future<void> load() async {
    state = stubState;
    errorMessage = stubError;
    items = stubItems;
    unreadCount = stubItems.where((i) => i.isUnread).length;
    notifyListeners();
  }

  @override
  Future<void> refreshUnreadCount() async {}
}

class TestProfileController extends ProfileController {
  TestProfileController(ProfileRepository repository) : super(repository: repository);

  @override
  Future<void> load() async {
    profile = const EmployeeProfileRead(
      employeeProfileId: 1,
      userId: 1,
      fullName: 'Test User',
      roleCodes: ['FLOOR_STAFF'],
      branchName: 'Main',
    );
    state = ProfileLoadState.ready;
    notifyListeners();
  }
}

class TestRequestsController extends RequestsController {
  TestRequestsController(RequestsRepository repository) : super(repository: repository);

  @override
  Future<void> load() async {
    state = RequestsLoadState.ready;
    notifyListeners();
  }
}

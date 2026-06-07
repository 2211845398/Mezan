import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/models/user_read.dart';
import 'package:mobile/features/dashboard/models/dashboard_models.dart';
import 'package:mobile/features/notifications/models/notification_delivery.dart';
import 'package:mobile/features/payroll/models/payslip_read.dart';
import 'package:mobile/features/profile/models/employee_profile.dart';
import 'package:mobile/features/requests/models/leave_request.dart';

void main() {
  group('UserRead', () {
    test('parses display name from parts', () {
      final user = UserRead.fromJson({
        'id': 1,
        'email': 'a@b.com',
        'status': 'active',
        'first_name': 'Ali',
        'family_name': 'Saleh',
        'employee_profile_id': 9,
      });
      expect(user.displayName, 'Ali Saleh');
      expect(user.hasEmployeeProfile, isTrue);
    });
  });

  group('PayslipRead', () {
    test('parses list response item', () {
      final slip = PayslipRead.fromJson({
        'id': 3,
        'period_start': '2026-06-01',
        'period_end': '2026-06-30',
        'net_amount': '1500.00',
        'gross_amount': '2000.00',
        'deductions': '500.00',
        'status': 'paid',
        'display_status': 'paid',
        'deduction_lines': [
          {'amount': '100', 'reason': 'Tax', 'source': 'automatic'},
        ],
      });
      expect(slip.netAmount, '1500.00');
      expect(slip.deductionLines, hasLength(1));
    });
  });

  group('NotificationDeliveryRead', () {
    test('detects unread delivery', () {
      final item = NotificationDeliveryRead.fromJson({
        'id': 1,
        'title': 'Payroll',
        'body': 'Ready',
        'created_at': '2026-06-05T10:00:00Z',
      });
      expect(item.isUnread, isTrue);
    });
  });

  group('AttendanceLogRead', () {
    test('open shift when clock_out missing', () {
      final log = AttendanceLogRead.fromJson({
        'id': 1,
        'branch_id': 2,
        'clock_in_at': '2026-06-05T08:00:00Z',
      });
      expect(log.isOpen, isTrue);
    });
  });

  group('EmployeeProfileRead', () {
    test('builds badge QR payload', () {
      final profile = EmployeeProfileRead.fromJson({
        'employee_profile_id': 42,
        'user_id': 1,
        'full_name': 'Test',
        'role_codes': ['FLOOR_STAFF'],
      });
      expect(profile.badgeQrPayload, 'mezan:employee:v1:42');
      expect(profile.rolesLabel, contains('FLOOR_STAFF'));
    });
  });

  group('LeaveRequestRead', () {
    test('parses status', () {
      final req = LeaveRequestRead.fromJson({
        'id': 1,
        'leave_type': 'vacation',
        'start_date': '2026-07-01',
        'end_date': '2026-07-05',
        'status': 'pending',
      });
      expect(req.status, 'pending');
    });
  });
}

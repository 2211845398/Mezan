import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/employee_shell.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/api/token_storage.dart';
import 'package:mobile/features/auth/auth_repository.dart';
import 'package:mobile/features/auth/auth_session.dart';
import 'package:mobile/features/auth/models/user_read.dart';

void main() {
  group('AuthSession role guard', () {
    late AuthSession session;

    setUp(() {
      final storage = TokenStorage();
      session = AuthSession(
        repository: AuthRepository(
          apiClient: ApiClient(tokenStorage: storage),
          tokenStorage: storage,
        ),
      );
    });

    test('isFloorStaff when FLOOR_STAFF present', () {
      session.roleCodes = const ['FLOOR_STAFF', 'CASHIER'];
      expect(session.isFloorStaff, isTrue);
    });

    test('isFloorStaff false for HR only', () {
      session.roleCodes = const ['HR_MANAGER'];
      expect(session.isFloorStaff, isFalse);
    });

    test('hasEmployeeProfile from user', () {
      session.user = const UserRead(
        id: 1,
        email: 'x@y.com',
        status: 'active',
        employeeProfileId: 5,
      );
      expect(session.hasEmployeeProfile, isTrue);
    });
  });

  group('buildEmployeeBranches', () {
    test('includes stock branch for floor staff', () {
      final withStock = buildEmployeeBranches(showStock: true);
      expect(withStock, hasLength(5));
    });

    test('hides stock branch otherwise', () {
      final without = buildEmployeeBranches(showStock: false);
      expect(without, hasLength(4));
    });
  });
}

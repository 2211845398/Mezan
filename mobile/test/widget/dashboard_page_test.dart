import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/api/token_storage.dart';
import 'package:mobile/features/auth/auth_repository.dart';
import 'package:mobile/features/auth/auth_session.dart';
import 'package:mobile/features/auth/models/user_read.dart';
import 'package:mobile/features/dashboard/dashboard_controller.dart';
import 'package:mobile/features/dashboard/dashboard_page.dart';
import 'package:mobile/features/dashboard/employee_self_service_repository.dart';
import 'package:provider/provider.dart';

import '../support/test_app.dart';
import '../support/test_controllers.dart';

void main() {
  testWidgets('dashboard shows attendance and leave stat cards', (tester) async {
    final storage = TokenStorage();
    final api = ApiClient(tokenStorage: storage);
    final repo = EmployeeSelfServiceRepository(apiClient: api);
    final dashboard = TestDashboardController(repo);
    final session = AuthSession(
      repository: AuthRepository(apiClient: api, tokenStorage: storage),
    );
    session.status = AuthStatus.authenticated;
    session.user = const UserRead(
      id: 1,
      email: 'e@t.com',
      status: 'active',
      employeeProfileId: 1,
    );

    await pumpMezanWidget(
      tester,
      const DashboardPage(),
      providers: [
        ChangeNotifierProvider<AuthSession>.value(value: session),
        ChangeNotifierProvider<DashboardController>.value(value: dashboard),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text("Today's Attendance"), findsOneWidget);
    expect(find.text('Leave balance'), findsOneWidget);
    expect(find.text('21'), findsWidgets);
    expect(find.text('Day off'), findsWidgets);
    expect(find.text('Scan Attendance QR'), findsOneWidget);
    expect(find.text('GPS'), findsNothing);
  });
}

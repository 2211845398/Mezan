import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/api/token_storage.dart';
import 'package:mobile/features/auth/auth_repository.dart';
import 'package:mobile/features/auth/auth_session.dart';
import 'package:mobile/features/auth/models/user_read.dart';
import 'package:mobile/features/payroll/payroll_controller.dart';
import 'package:mobile/features/payroll/payroll_page.dart';
import 'package:mobile/features/payroll/payroll_repository.dart';
import 'package:provider/provider.dart';

import '../support/test_app.dart';
import '../support/test_controllers.dart';

void main() {
  testWidgets('payroll list navigates to payslip detail page', (tester) async {
    final storage = TokenStorage();
    final api = ApiClient(tokenStorage: storage);
    final payroll = TestPayrollController(PayrollRepository(apiClient: api));
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
      const PayrollPage(),
      providers: [
        ChangeNotifierProvider<AuthSession>.value(value: session),
        ChangeNotifierProvider<PayrollController>.value(value: payroll),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('This month net pay'), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right), findsWidgets);

    await tester.tap(find.byIcon(Icons.chevron_right).first);
    await tester.pumpAndSettle();

    expect(find.text('Base salary'), findsOneWidget);
    expect(find.text('Earnings'), findsOneWidget);
    expect(find.text('Deductions'), findsOneWidget);
  });
}

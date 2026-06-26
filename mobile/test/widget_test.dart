import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:mobile/app/mezan_app.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/api/token_storage.dart';
import 'package:mobile/core/i18n/locale_controller.dart';
import 'package:mobile/core/i18n/theme_mode_controller.dart';
import 'package:mobile/features/auth/auth_repository.dart';
import 'package:mobile/features/auth/auth_session.dart';
import 'package:mobile/features/dashboard/dashboard_controller.dart';
import 'package:mobile/features/dashboard/employee_self_service_repository.dart';
import 'package:mobile/features/notifications/notification_repository.dart';
import 'package:mobile/features/notifications/notifications_controller.dart';
import 'package:mobile/features/payroll/payroll_controller.dart';
import 'package:mobile/features/payroll/payroll_repository.dart';
import 'package:mobile/features/profile/profile_controller.dart';
import 'package:mobile/features/profile/profile_repository.dart';
import 'package:mobile/features/requests/requests_controller.dart';
import 'package:mobile/features/stock/stock_controller.dart';
import 'package:mobile/features/stock/stock_repository.dart';
import 'package:mobile/features/requests/requests_repository.dart';

void main() {
  testWidgets('shows login when unauthenticated', (tester) async {
    final tokenStorage = TokenStorage();
    final apiClient = ApiClient(tokenStorage: tokenStorage);
    final authRepository = AuthRepository(
      apiClient: apiClient,
      tokenStorage: tokenStorage,
    );
    final authSession = AuthSession(repository: authRepository);
    authSession.status = AuthStatus.unauthenticated;
    final employeeRepo = EmployeeSelfServiceRepository(apiClient: apiClient);
    final notificationRepo = NotificationRepository(apiClient: apiClient);
    final notificationsController =
        NotificationsController(repository: notificationRepo);
    final payrollRepo = PayrollRepository(apiClient: apiClient);
    final requestsRepo = RequestsRepository(apiClient: apiClient);
    final profileRepo = ProfileRepository(apiClient: apiClient);
    final stockRepo = StockRepository(apiClient: apiClient);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: apiClient),
          Provider<AuthRepository>.value(value: authRepository),
          Provider<EmployeeSelfServiceRepository>.value(value: employeeRepo),
          Provider<NotificationRepository>.value(value: notificationRepo),
          ChangeNotifierProvider.value(value: notificationsController),
          Provider<PayrollRepository>.value(value: payrollRepo),
          Provider<RequestsRepository>.value(value: requestsRepo),
          Provider<ProfileRepository>.value(value: profileRepo),
          Provider<StockRepository>.value(value: stockRepo),
          ChangeNotifierProvider(
            create: (_) => DashboardController(repository: employeeRepo),
          ),
          ChangeNotifierProvider(
            create: (_) => PayrollController(repository: payrollRepo),
          ),
          ChangeNotifierProvider(
            create: (_) => RequestsController(repository: requestsRepo),
          ),
          ChangeNotifierProvider(
            create: (_) => ProfileController(repository: profileRepo),
          ),
          ChangeNotifierProvider(
            create: (_) => StockController(repository: stockRepo),
          ),
          ChangeNotifierProvider(
            create: (_) => LocaleController(initial: const Locale('en')),
          ),
          ChangeNotifierProvider(create: (_) => ThemeModeController()),
          ChangeNotifierProvider.value(value: authSession),
        ],
        child: const MezanApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsWidgets);
  });
}

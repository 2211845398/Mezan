import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app/mezan_app.dart';
import 'core/api/api_client.dart';
import 'core/api/token_storage.dart';
import 'core/i18n/locale_controller.dart';
import 'core/i18n/theme_mode_controller.dart';
import 'features/attendance_kiosk/attendance_kiosk_repository.dart';
import 'features/auth/auth_repository.dart';
import 'features/auth/auth_session.dart';
import 'features/dashboard/dashboard_controller.dart';
import 'features/dashboard/employee_self_service_repository.dart';
import 'features/notifications/notification_repository.dart';
import 'features/notifications/notifications_controller.dart';
import 'features/payroll/payroll_controller.dart';
import 'features/payroll/payroll_repository.dart';
import 'features/profile/profile_controller.dart';
import 'features/profile/profile_repository.dart';
import 'features/requests/requests_controller.dart';
import 'features/stock/stock_controller.dart';
import 'features/stock/stock_repository.dart';
import 'features/requests/correspondence_repository.dart';
import 'features/requests/requests_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final localeController = LocaleController();
  final themeModeController = ThemeModeController();
  final tokenStorage = TokenStorage();
  final apiClient = ApiClient(tokenStorage: tokenStorage);
  final authRepository = AuthRepository(
    apiClient: apiClient,
    tokenStorage: tokenStorage,
  );
  final authSession = AuthSession(
    repository: authRepository,
    localeController: localeController,
  );
  final employeeSelfServiceRepository =
      EmployeeSelfServiceRepository(apiClient: apiClient);
  final notificationRepository =
      NotificationRepository(apiClient: apiClient);
  final notificationsController = NotificationsController(
    repository: notificationRepository,
  );
  final payrollRepository = PayrollRepository(apiClient: apiClient);
  final requestsRepository = RequestsRepository(apiClient: apiClient);
  final correspondenceRepository =
      CorrespondenceRepository(apiClient: apiClient);
  final profileRepository = ProfileRepository(apiClient: apiClient);
  final stockRepository = StockRepository(apiClient: apiClient);
  final attendanceKioskRepository =
      AttendanceKioskRepository(apiClient: apiClient);

  await Future.wait([
    localeController.load(),
    themeModeController.load(),
  ]);

  apiClient.setLocaleHeader(localeController.locale.languageCode);
  localeController.addListener(() {
    apiClient.setLocaleHeader(localeController.locale.languageCode);
  });

  apiClient.setOnSessionExpired(authSession.handleSessionExpired);

  await authSession.bootstrap();
  await notificationsController.refreshUnreadCount();

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: apiClient),
        Provider<AuthRepository>.value(value: authRepository),
        Provider<EmployeeSelfServiceRepository>.value(
          value: employeeSelfServiceRepository,
        ),
        Provider<NotificationRepository>.value(value: notificationRepository),
        ChangeNotifierProvider.value(value: notificationsController),
        Provider<PayrollRepository>.value(value: payrollRepository),
        Provider<RequestsRepository>.value(value: requestsRepository),
        Provider<CorrespondenceRepository>.value(value: correspondenceRepository),
        Provider<ProfileRepository>.value(value: profileRepository),
        Provider<StockRepository>.value(value: stockRepository),
        Provider<AttendanceKioskRepository>.value(
          value: attendanceKioskRepository,
        ),
        ChangeNotifierProvider(
          create: (_) => DashboardController(
            repository: employeeSelfServiceRepository,
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => PayrollController(repository: payrollRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => RequestsController(repository: requestsRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => ProfileController(repository: profileRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => StockController(repository: stockRepository),
        ),
        ChangeNotifierProvider.value(value: localeController),
        ChangeNotifierProvider.value(value: themeModeController),
        ChangeNotifierProvider.value(value: authSession),
      ],
      child: const MezanApp(),
    ),
  );
}

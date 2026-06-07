import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/api/token_storage.dart';
import 'package:mobile/features/notifications/notifications_controller.dart';
import 'package:mobile/features/notifications/notifications_page.dart';
import 'package:mobile/features/notifications/notification_repository.dart';
import 'package:provider/provider.dart';

import '../support/test_app.dart';
import '../support/test_controllers.dart';

void main() {
  testWidgets('notifications empty state is translated', (tester) async {
    final storage = TokenStorage();
    final api = ApiClient(tokenStorage: storage);
    final controller = TestNotificationsController(
      repository: NotificationRepository(apiClient: api),
      stubItems: const [],
      stubState: NotificationsLoadState.ready,
    );

    await pumpMezanWidget(
      tester,
      const NotificationsPage(),
      providers: [
        ChangeNotifierProvider<NotificationsController>.value(value: controller),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('No notifications'), findsOneWidget);
  });

  testWidgets('notifications error state shows retry', (tester) async {
    final storage = TokenStorage();
    final api = ApiClient(tokenStorage: storage);
    final controller = TestNotificationsController(
      repository: NotificationRepository(apiClient: api),
      stubState: NotificationsLoadState.error,
      stubError: 'Server error',
    );

    await pumpMezanWidget(
      tester,
      const NotificationsPage(),
      providers: [
        ChangeNotifierProvider<NotificationsController>.value(value: controller),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('Try again'), findsOneWidget);
  });
}

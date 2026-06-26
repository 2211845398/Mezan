import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api/api_client.dart';
import 'package:mobile/core/api/token_storage.dart';
import 'package:mobile/features/requests/leave_tab.dart';
import 'package:mobile/features/requests/requests_controller.dart';
import 'package:mobile/features/requests/requests_repository.dart';
import 'package:provider/provider.dart';

import '../support/test_app.dart';
import '../support/test_controllers.dart';

void main() {
  testWidgets('leave form requires dates before submit', (tester) async {
    final storage = TokenStorage();
    final api = ApiClient(tokenStorage: storage);
    final requests = TestRequestsController(
      RequestsRepository(apiClient: api),
    );

    await pumpMezanWidget(
      tester,
      const LeaveTab(),
      providers: [
        ChangeNotifierProvider<RequestsController>.value(value: requests),
      ],
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Submit request'));
    await tester.pumpAndSettle();

    expect(find.text('Select start and end dates'), findsOneWidget);
  });
}

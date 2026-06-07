import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_empty_state.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import '../auth/auth_session.dart';
import 'correspondence_tab.dart';
import 'leave_tab.dart';
import 'requests_controller.dart';

class RequestsPage extends StatefulWidget {
  const RequestsPage({super.key});

  @override
  State<RequestsPage> createState() => _RequestsPageState();
}

class _RequestsPageState extends State<RequestsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (context.read<AuthSession>().hasEmployeeProfile) {
        context.read<RequestsController>().load();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final session = context.watch<AuthSession>();
    final controller = context.watch<RequestsController>();
    final ext = MezanThemeExtension.of(context);
    final scheme = Theme.of(context).colorScheme;

    if (!session.hasEmployeeProfile) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanEmptyState(
            title: strings.noEmployeeProfileTitle,
            message: strings.noEmployeeProfileBody,
            icon: Icons.event_note_outlined,
          ),
        ],
      );
    }

    if (controller.isLoading && controller.state != RequestsLoadState.ready) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: MezanLoadingState(),
      );
    }

    if (controller.state == RequestsLoadState.error) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanErrorState(
            message: controller.errorMessage,
            onRetry: controller.load,
          ),
        ],
      );
    }

    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          Material(
            color: ext.card,
            child: TabBar(
              labelColor: scheme.secondary,
              unselectedLabelColor: ext.mutedForeground,
              indicatorColor: scheme.secondary,
              tabs: [
                Tab(text: strings.requestsTabLeave),
                Tab(text: strings.requestsTabCorrespondence),
              ],
            ),
          ),
          const Expanded(
            child: TabBarView(
              children: [
                LeaveTab(),
                CorrespondenceTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

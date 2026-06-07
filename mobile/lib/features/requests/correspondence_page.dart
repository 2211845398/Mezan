import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../shared/widgets/mezan_empty_state.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import '../auth/auth_session.dart';
import '../requests/correspondence_tab.dart';
import '../requests/requests_controller.dart';

/// Correspondence-only screen (leave requests moved to [MyLeavesPage]).
class CorrespondencePage extends StatefulWidget {
  const CorrespondencePage({super.key});

  @override
  State<CorrespondencePage> createState() => _CorrespondencePageState();
}

class _CorrespondencePageState extends State<CorrespondencePage> {
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

    if (!session.hasEmployeeProfile) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanEmptyState(
            title: strings.noEmployeeProfileTitle,
            message: strings.noEmployeeProfileBody,
            icon: Icons.mail_outline,
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

    return const CorrespondenceTab();
  }
}

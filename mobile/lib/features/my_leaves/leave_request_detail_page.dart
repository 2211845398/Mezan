import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/format_leave.dart';
import '../../core/i18n/app_strings.dart';
import '../../shared/widgets/mezan_badge.dart';
import '../../shared/widgets/mezan_read_only_field.dart';
import '../../shared/widgets/mezan_detail_scaffold.dart';
import '../requests/models/leave_request.dart';
import '../requests/requests_controller.dart';

class LeaveRequestDetailPage extends StatelessWidget {
  const LeaveRequestDetailPage({super.key, required this.requestId});

  final int requestId;

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final controller = context.watch<RequestsController>();
    final matches = controller.leaveRequests.where((r) => r.id == requestId);
    final request = matches.isEmpty ? null : matches.first;

    if (request == null) {
      return MezanDetailScaffold(
        title: strings.leaveRequestAction,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final (statusLabel, variant) = _status(strings, request.status);
    final typeLabel = switch (request.leaveType) {
      'sick' => strings.leaveTypeSick,
      'personal' => strings.leaveTypePersonal,
      _ => strings.leaveTypeVacation,
    };

    return MezanDetailScaffold(
      title: strings.leaveRequestAction,
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: MezanBadge(label: statusLabel, variant: variant),
          ),
          const SizedBox(height: 16),
          MezanReadOnlyField(label: strings.leaveTypeLabel, value: typeLabel),
          const SizedBox(height: 12),
          MezanReadOnlyField(
            label: strings.leaveStartDate,
            value: request.startDate,
          ),
          const SizedBox(height: 12),
          MezanReadOnlyField(
            label: strings.leaveEndDate,
            value: request.endDate,
          ),
          if (request.reason != null && request.reason!.isNotEmpty) ...[
            const SizedBox(height: 12),
            MezanReadOnlyField(
              label: strings.leaveReasonLabel,
              value: request.reason!,
            ),
          ],
          if (request.reviewNotes != null && request.reviewNotes!.isNotEmpty) ...[
            const SizedBox(height: 12),
            MezanReadOnlyField(
              label: strings.leaveReviewNotesFieldLabel,
              value: request.reviewNotes!,
            ),
          ],
          if (request.vacationBalanceRemaining != null) ...[
            const SizedBox(height: 12),
            MezanReadOnlyField(
              label: strings.leaveRemaining,
              value: formatLeaveDays(request.vacationBalanceRemaining!),
            ),
          ],
        ],
      ),
    );
  }

  (String, MezanBadgeVariant) _status(AppStrings strings, String status) {
    return switch (status) {
      'approved' => (strings.leaveStatusApproved, MezanBadgeVariant.success),
      'rejected' => (strings.leaveStatusRejected, MezanBadgeVariant.destructive),
      _ => (strings.leaveStatusPending, MezanBadgeVariant.warning),
    };
  }
}

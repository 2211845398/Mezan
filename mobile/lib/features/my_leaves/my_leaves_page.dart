import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/format/format_leave.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_badge.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_number_text.dart';
import '../auth/auth_session.dart';
import '../requests/models/leave_request.dart';
import '../requests/requests_controller.dart';

class MyLeavesPage extends StatefulWidget {
  const MyLeavesPage({super.key});

  @override
  State<MyLeavesPage> createState() => _MyLeavesPageState();
}

class _MyLeavesPageState extends State<MyLeavesPage> {
  String? _statusFilter;

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

  Future<void> _openCreateLeave() async {
    final created = await context.push<bool>('/my-leaves/new');
    if (!mounted || created != true) return;
    await context.read<RequestsController>().load();
  }

  List<LeaveRequestRead> _filtered(List<LeaveRequestRead> items) {
    if (_statusFilter == null) return items;
    return items.where((r) => r.status == _statusFilter).toList();
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final controller = context.watch<RequestsController>();
    final ext = MezanThemeExtension.of(context);
    final balance = controller.leaveBalance;
    final filtered = _filtered(controller.leaveRequests);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: controller.canSubmitLeave ? _openCreateLeave : null,
        icon: const Icon(Icons.add),
        label: Text(strings.leaveRequestAction),
        backgroundColor: scheme.secondary,
        foregroundColor: scheme.onSecondary,
      ),
      body: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            if (!controller.canSubmitLeave) ...[
              MezanCard(
                child: Text(
                  strings.leavePendingLimitMessage,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: ext.mutedForeground,
                      ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (balance != null)
              MezanCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      strings.leaveBalanceCardTitle,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    _BalanceRow(
                      label: strings.leaveEntitlement,
                      value: formatLeaveDays(balance.entitlementDays),
                    ),
                    _BalanceRow(
                      label: strings.leaveUsed,
                      value: formatLeaveDays(balance.usedDays),
                    ),
                    _BalanceRow(
                      label: strings.leaveRemaining,
                      value: formatLeaveDays(balance.remainingDays),
                      emphasized: true,
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilterChip(
                  label: Text(strings.leaveFilterAll),
                  selected: _statusFilter == null,
                  onSelected: (_) => setState(() => _statusFilter = null),
                ),
                FilterChip(
                  label: Text(strings.leaveStatusPending),
                  selected: _statusFilter == 'pending',
                  onSelected: (_) => setState(() => _statusFilter = 'pending'),
                ),
                FilterChip(
                  label: Text(strings.leaveStatusApproved),
                  selected: _statusFilter == 'approved',
                  onSelected: (_) => setState(() => _statusFilter = 'approved'),
                ),
                FilterChip(
                  label: Text(strings.leaveStatusRejected),
                  selected: _statusFilter == 'rejected',
                  onSelected: (_) => setState(() => _statusFilter = 'rejected'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              strings.leaveHistoryTitle,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: ext.mutedForeground,
                  ),
            ),
            const SizedBox(height: 8),
            if (filtered.isEmpty)
              MezanCard(
                child: Text(
                  strings.leaveHistoryEmpty,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: ext.mutedForeground,
                      ),
                ),
              )
            else
              ...filtered.map(
                (req) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _LeaveRequestTile(request: req, strings: strings),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _BalanceRow extends StatelessWidget {
  const _BalanceRow({
    required this.label,
    required this.value,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          MezanNumberText(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: emphasized ? FontWeight.w700 : null,
                ),
          ),
        ],
      ),
    );
  }
}

class _LeaveRequestTile extends StatelessWidget {
  const _LeaveRequestTile({required this.request, required this.strings});

  final LeaveRequestRead request;
  final AppStrings strings;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    final (statusLabel, variant) = _status(strings, request.status);
    final typeLabel = switch (request.leaveType) {
      'sick' => strings.leaveTypeSick,
      'personal' => strings.leaveTypePersonal,
      _ => strings.leaveTypeVacation,
    };

    return MezanCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      onTap: () => context.push('/my-leaves/${request.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(typeLabel, style: Theme.of(context).textTheme.bodyLarge),
                    const SizedBox(height: 4),
                    MezanNumberText(
                      '${request.startDate} → ${request.endDate}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: ext.mutedForeground,
                          ),
                    ),
                  ],
                ),
              ),
              MezanBadge(label: statusLabel, variant: variant),
            ],
          ),
          if (request.reason != null && request.reason!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              request.reason!,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (request.reviewNotes != null &&
              request.reviewNotes!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              strings.leaveReviewNotes(request.reviewNotes!),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: ext.mutedForeground,
                    fontStyle: FontStyle.italic,
                  ),
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

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/format_leave.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/i18n/locale_controller.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_badge.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_number_text.dart';
import '../../shared/widgets/mezan_text_field.dart';
import '../auth/auth_session.dart';
import 'models/leave_request.dart';
import 'requests_controller.dart';

class MyLeavesPage extends StatefulWidget {
  const MyLeavesPage({super.key});

  @override
  State<MyLeavesPage> createState() => _MyLeavesPageState();
}

class _MyLeavesPageState extends State<MyLeavesPage> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();
  String _leaveType = 'vacation';
  DateTime? _startDate;
  DateTime? _endDate;
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

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool isStart}) async {
    final now = DateTime.now();
    final locale = context.read<LocaleController>().locale;
    final picked = await showDatePicker(
      context: context,
      locale: locale,
      initialDate: isStart ? (_startDate ?? now) : (_endDate ?? _startDate ?? now),
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 2),
      builder: (context, child) {
        return Localizations.override(
          context: context,
          locale: const Locale('en'),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (isStart) {
        _startDate = picked;
        if (_endDate != null && _endDate!.isBefore(picked)) {
          _endDate = picked;
        }
      } else {
        _endDate = picked;
      }
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    if (_startDate == null || _endDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(strings.leaveDatesRequired)),
      );
      return;
    }
    final controller = context.read<RequestsController>();
    final ok = await controller.submitLeave(
      leaveType: _leaveType,
      startDate: _startDate!,
      endDate: _endDate!,
      reason: _reasonController.text,
    );
    if (!mounted || !ok) return;

    _reasonController.clear();
    setState(() {
      _startDate = null;
      _endDate = null;
      _leaveType = 'vacation';
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(strings.leaveSubmitSuccess)),
    );
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

    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (controller.leaveSubmitError != null) ...[
            MezanErrorState(message: controller.leaveSubmitError),
            const SizedBox(height: 12),
          ],
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
          const SizedBox(height: 12),
          MezanCard(
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    strings.leaveFormTitle,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: _leaveType,
                    decoration: InputDecoration(
                      labelText: strings.leaveTypeLabel,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    items: [
                      DropdownMenuItem(
                        value: 'vacation',
                        child: Text(strings.leaveTypeVacation),
                      ),
                      DropdownMenuItem(
                        value: 'sick',
                        child: Text(strings.leaveTypeSick),
                      ),
                      DropdownMenuItem(
                        value: 'personal',
                        child: Text(strings.leaveTypePersonal),
                      ),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _leaveType = v);
                    },
                  ),
                  const SizedBox(height: 12),
                  _DateField(
                    label: strings.leaveStartDate,
                    value: _startDate,
                    onTap: () => _pickDate(isStart: true),
                  ),
                  const SizedBox(height: 12),
                  _DateField(
                    label: strings.leaveEndDate,
                    value: _endDate,
                    onTap: () => _pickDate(isStart: false),
                  ),
                  const SizedBox(height: 12),
                  MezanTextField(
                    controller: _reasonController,
                    label: strings.leaveReasonLabel,
                    hint: strings.leaveReasonHint,
                    maxLines: 3,
                  ),
                  const SizedBox(height: 16),
                  MezanButton(
                    label: strings.leaveSubmitButton,
                    expand: true,
                    loading: controller.isSubmittingLeave,
                    onPressed: controller.isSubmittingLeave ||
                            !controller.canSubmitLeave
                        ? null
                        : _submit,
                  ),
                ],
              ),
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
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final display = value == null
        ? '—'
        : '${value!.year}-${value!.month.toString().padLeft(2, '0')}-${value!.day.toString().padLeft(2, '0')}';
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          suffixIcon: const Icon(Icons.calendar_today, size: 20),
        ),
        child: MezanNumberText(display),
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

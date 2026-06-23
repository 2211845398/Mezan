import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/i18n/locale_controller.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_number_text.dart';
import '../../shared/widgets/mezan_notify.dart';
import '../../shared/widgets/mezan_text_field.dart';
import '../../shared/widgets/mezan_validation_alert.dart';
import '../requests/requests_controller.dart';

class CreateLeaveRequestPage extends StatefulWidget {
  const CreateLeaveRequestPage({super.key});

  @override
  State<CreateLeaveRequestPage> createState() => _CreateLeaveRequestPageState();
}

class _CreateLeaveRequestPageState extends State<CreateLeaveRequestPage> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();
  String _leaveType = 'vacation';
  DateTime? _startDate;
  DateTime? _endDate;
  String? _validationError;

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
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    if (_startDate == null || _endDate == null) {
      setState(() => _validationError = strings.leaveDatesRequired);
      return;
    }
    setState(() => _validationError = null);
    final controller = context.read<RequestsController>();
    final ok = await controller.submitLeave(
      leaveType: _leaveType,
      startDate: _startDate!,
      endDate: _endDate!,
      reason: _reasonController.text,
    );
    if (!mounted || !ok) return;

    MezanNotify.success(context, strings.leaveSubmitSuccess);
    context.pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final controller = context.watch<RequestsController>();
    final ext = MezanThemeExtension.of(context);

    return Scaffold(
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => context.pop(),
              ),
              Expanded(
                child: Text(
                  strings.leaveFormTitle,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
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
          if (controller.leaveSubmitError != null) ...[
            MezanErrorState(message: controller.leaveSubmitError),
            const SizedBox(height: 12),
          ],
          MezanCard(
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
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
                  if (_validationError != null) ...[
                    MezanValidationAlert(message: _validationError!),
                    const SizedBox(height: 12),
                  ],
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

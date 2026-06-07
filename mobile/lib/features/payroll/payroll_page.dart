import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/format/format_money.dart';
import '../../core/format/latin_digits.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_badge.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_empty_state.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import '../../shared/widgets/mezan_number_text.dart';
import '../auth/auth_session.dart';
import 'models/payslip_read.dart';
import 'payroll_controller.dart';
import 'payslip_detail_page.dart';

class PayrollPage extends StatefulWidget {
  const PayrollPage({super.key});

  @override
  State<PayrollPage> createState() => _PayrollPageState();
}

class _PayrollPageState extends State<PayrollPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (context.read<AuthSession>().hasEmployeeProfile) {
        context.read<PayrollController>().load();
      }
    });
  }

  void _openPayslipDetail(int payslipId) {
    Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => PayslipDetailPage(payslipId: payslipId),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final locale = Localizations.localeOf(context).languageCode;
    final session = context.watch<AuthSession>();
    final controller = context.watch<PayrollController>();
    final ext = MezanThemeExtension.of(context);

    if (!session.hasEmployeeProfile) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanEmptyState(
            title: strings.noEmployeeProfileTitle,
            message: strings.noEmployeeProfileBody,
            icon: Icons.payments_outlined,
          ),
        ],
      );
    }

    if (controller.isLoading && controller.state != PayrollLoadState.ready) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: MezanLoadingState(),
      );
    }

    if (controller.state == PayrollLoadState.error) {
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

    if (controller.payslips.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanEmptyState(
            title: strings.payrollEmptyTitle,
            message: strings.payrollEmptyBody,
            icon: Icons.payments_outlined,
          ),
        ],
      );
    }

    final header = controller.currentMonthPayslip;

    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (header != null) ...[
            MezanCard(
              radius: MezanCardRadius.hero,
              onTap: () => _openPayslipDetail(header.id),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          strings.payrollCurrentMonthTitle,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      _StatusBadge(
                        status: header.displayStatus,
                        strings: strings,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  MezanNumberText(
                    formatMoney(
                      double.tryParse(header.netAmount) ?? 0,
                      locale: locale,
                      currencySymbol: strings.currencySymbol,
                    ),
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          color: ext.foreground,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    strings.payrollNetLabel,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: ext.mutedForeground,
                        ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          ...controller.payslips.map(
            (slip) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _PayslipListTile(
                slip: slip,
                strings: strings,
                locale: locale,
                onTap: () => _openPayslipDetail(slip.id),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status, required this.strings});

  final String status;
  final AppStrings strings;

  @override
  Widget build(BuildContext context) {
    final (label, variant) = switch (status) {
      'paid' => (strings.payslipStatusPaid, MezanBadgeVariant.success),
      'approved' => (strings.payslipStatusApproved, MezanBadgeVariant.secondary),
      _ => (strings.payslipStatusDraft, MezanBadgeVariant.muted),
    };
    return MezanBadge(label: label, variant: variant);
  }
}

class _PayslipListTile extends StatelessWidget {
  const _PayslipListTile({
    required this.slip,
    required this.strings,
    required this.locale,
    required this.onTap,
  });

  final PayslipRead slip;
  final AppStrings strings;
  final String locale;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    final monthLabel = toLatinDigits(
      DateFormat.yMMMM(locale.startsWith('ar') ? 'ar' : 'en')
          .format(slip.periodStartDate),
    );

    return MezanCard(
      padding: EdgeInsets.zero,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    monthLabel,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 4),
                  MezanNumberText(
                    formatMoney(
                      double.tryParse(slip.netAmount) ?? 0,
                      locale: locale,
                      currencySymbol: strings.currencySymbol,
                    ),
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: ext.mutedForeground,
                        ),
                  ),
                ],
              ),
            ),
            _StatusBadge(status: slip.displayStatus, strings: strings),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, color: ext.mutedForeground),
          ],
        ),
      ),
    );
  }
}

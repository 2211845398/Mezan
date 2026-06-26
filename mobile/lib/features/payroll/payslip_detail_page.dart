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
import '../../shared/widgets/mezan_number_text.dart';
import 'lib/translate_deduction_reason.dart';
import 'models/payslip_read.dart';
import 'payroll_controller.dart';

class PayslipDetailPage extends StatelessWidget {
  const PayslipDetailPage({super.key, required this.payslipId});

  final int payslipId;

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final locale = Localizations.localeOf(context).languageCode;
    final slip = context.watch<PayrollController>().payslipById(payslipId);

    if (slip == null) {
      return Scaffold(
        appBar: AppBar(title: Text(strings.payrollDetailTitle)),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            MezanEmptyState(
              title: strings.payrollDetailNotFoundTitle,
              message: strings.payrollDetailNotFoundBody,
              icon: Icons.payments_outlined,
            ),
          ],
        ),
      );
    }

    final monthLabel = toLatinDigits(
      DateFormat.yMMMM(locale.startsWith('ar') ? 'ar' : 'en')
          .format(slip.periodStartDate),
    );
    final detailLines =
        slip.deductionLines.where((line) => line.isDetailOnly).toList();

    return Scaffold(
      appBar: AppBar(title: Text(monthLabel)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          _HeroNetCard(slip: slip, strings: strings, locale: locale),
          const SizedBox(height: 12),
          _SectionCard(
            title: strings.payrollEarningsTitle,
            child: Column(
              children: [
                _AmountRow(
                  label: strings.payrollBaseSalary,
                  value: slip.baseSalaryAmount,
                  locale: locale,
                  strings: strings,
                ),
                _AmountRow(
                  label: strings.payrollOvertime,
                  value: slip.overtimeAmount,
                  locale: locale,
                  strings: strings,
                ),
                _AmountRow(
                  label: strings.payrollBonus,
                  value: slip.bonusAmount,
                  locale: locale,
                  strings: strings,
                ),
                const Divider(height: 24),
                _AmountRow(
                  label: strings.payrollGross,
                  value: slip.grossAmount,
                  locale: locale,
                  strings: strings,
                  emphasized: true,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: strings.payrollDeductionsTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _AmountRow(
                  label: strings.payrollAutomaticDeductions,
                  value: slip.automaticDeductionsAmount,
                  locale: locale,
                  strings: strings,
                  destructive: true,
                ),
                if (detailLines.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _DeductionLinesList(
                    lines: detailLines,
                    isArabic: strings.isArabic,
                  ),
                ],
                const SizedBox(height: 8),
                _AmountRow(
                  label: strings.payrollManualDeductions,
                  value: slip.manualDeductionsAmount,
                  locale: locale,
                  strings: strings,
                  destructive: true,
                ),
                const Divider(height: 24),
                _AmountRow(
                  label: strings.payrollTotalDeductions,
                  value: slip.deductions,
                  locale: locale,
                  strings: strings,
                  destructive: true,
                  emphasized: true,
                ),
              ],
            ),
          ),
          if (slip.paidAt != null) ...[
            const SizedBox(height: 12),
            _SectionCard(
              title: strings.payrollPaymentTitle,
              child: _AmountRow(
                label: strings.payrollPaidDate,
                value: slip.paidAt!.substring(0, 10),
                locale: locale,
                strings: strings,
                raw: true,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HeroNetCard extends StatelessWidget {
  const _HeroNetCard({
    required this.slip,
    required this.strings,
    required this.locale,
  });

  final PayslipRead slip;
  final AppStrings strings;
  final String locale;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    final (label, variant) = switch (slip.displayStatus) {
      'paid' => (strings.payslipStatusPaid, MezanBadgeVariant.success),
      'approved' => (strings.payslipStatusApproved, MezanBadgeVariant.secondary),
      _ => (strings.payslipStatusDraft, MezanBadgeVariant.muted),
    };

    return MezanCard(
      radius: MezanCardRadius.hero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  strings.payrollNetLabel,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              MezanBadge(label: label, variant: variant),
            ],
          ),
          const SizedBox(height: 12),
          MezanNumberText(
            formatMoney(
              double.tryParse(slip.netAmount) ?? 0,
              locale: locale,
              currencySymbol: strings.currencySymbol,
            ),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: ext.foreground,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return MezanCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _DeductionLinesList extends StatelessWidget {
  const _DeductionLinesList({
    required this.lines,
    required this.isArabic,
  });

  final List<PayslipDeductionLine> lines;
  final bool isArabic;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);

    return Container(
      constraints: const BoxConstraints(maxHeight: 220),
      decoration: BoxDecoration(
        border: Border.all(color: ext.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        physics: const BouncingScrollPhysics(),
        itemCount: lines.length,
        separatorBuilder: (_, __) => Divider(height: 1, color: ext.border),
        itemBuilder: (context, index) {
          final line = lines[index];
          final label = formatDeductionLineLabel(
            reason: line.reason,
            isArabic: isArabic,
            date: line.date,
          );

          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Icon(Icons.remove_circle_outline, size: 18, color: ext.destructive),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    label,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: ext.mutedForeground,
                        ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AmountRow extends StatelessWidget {
  const _AmountRow({
    required this.label,
    required this.value,
    required this.locale,
    required this.strings,
    this.destructive = false,
    this.emphasized = false,
    this.raw = false,
  });

  final String label;
  final String? value;
  final String locale;
  final AppStrings strings;
  final bool destructive;
  final bool emphasized;
  final bool raw;

  @override
  Widget build(BuildContext context) {
    if (value == null) return const SizedBox.shrink();
    final ext = MezanThemeExtension.of(context);
    final display = raw
        ? value!
        : formatMoney(
            double.tryParse(value!) ?? 0,
            locale: locale,
            currencySymbol: strings.currencySymbol,
          );
    final color = destructive ? ext.destructive : ext.foreground;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: emphasized ? FontWeight.w600 : null,
                  ),
            ),
          ),
          MezanNumberText(
            display,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: color,
                  fontWeight: emphasized ? FontWeight.w700 : null,
                ),
          ),
        ],
      ),
    );
  }
}

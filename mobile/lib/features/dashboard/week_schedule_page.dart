import 'package:flutter/material.dart';

import '../../core/format/format_time.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_number_text.dart';
import 'models/dashboard_models.dart';

class WeekSchedulePage extends StatelessWidget {
  const WeekSchedulePage({super.key, required this.schedules});

  final List<WeeklyScheduleRead> schedules;

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final ext = MezanThemeExtension.of(context);
    final byWeekday = <int, WeeklyScheduleRead>{
      for (final row in schedules) row.weekday: row,
    };

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.weekScheduleTitle),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          for (var i = 0; i < kWeekDisplayOrderFromFriday.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            _WeekdayRow(
              weekday: kWeekDisplayOrderFromFriday[i],
              schedule: byWeekday[kWeekDisplayOrderFromFriday[i]],
              arabic: strings.isArabic,
              ext: ext,
            ),
          ],
        ],
      ),
    );
  }
}

class _WeekdayRow extends StatelessWidget {
  const _WeekdayRow({
    required this.weekday,
    required this.schedule,
    required this.arabic,
    required this.ext,
  });

  final int weekday;
  final WeeklyScheduleRead? schedule;
  final bool arabic;
  final MezanThemeExtension ext;

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(arabic ? 'ar' : 'en');
    final dayName = weekdayLabel(weekday, arabic: arabic);
    final detail = schedule == null
        ? strings.t('لا يوجد جدول', 'No schedule')
        : schedule!.isDayOff
            ? strings.dayOffLabel
            : '${formatApiTime(schedule!.startTime)}–${formatApiTime(schedule!.endTime)}';

    return MezanCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Expanded(
            child: Text(
              dayName,
              style: Theme.of(context).textTheme.titleSmall,
            ),
          ),
          MezanNumberText(
            detail,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: schedule?.isDayOff == true
                      ? ext.mutedForeground
                      : null,
                ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/format_date.dart';
import '../../core/format/format_leave.dart';
import '../../core/format/format_time.dart';
import 'week_schedule_page.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_badge.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_empty_state.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import '../../shared/widgets/mezan_number_text.dart';
import '../../shared/widgets/mezan_stat_card.dart';
import '../auth/auth_session.dart';
import 'attendance_qr_scan_page.dart';
import 'dashboard_controller.dart';
import 'models/dashboard_models.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final session = context.read<AuthSession>();
      if (session.hasEmployeeProfile) {
        context.read<DashboardController>().load();
      }
    });
  }

  Future<void> _scanAttendance() async {
    final controller = context.read<DashboardController>();
    final strings = AppStrings(Localizations.localeOf(context).languageCode);

    if (controller.attendanceIntent == AttendanceIntent.checkOut &&
        controller.openShift == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(strings.attendanceNoOpenCheckIn)),
      );
      return;
    }

    final qr = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const AttendanceQrScanPage()),
    );
    if (!mounted || qr == null || qr.isEmpty) return;

    final ok = await controller.submitAttendanceQr(qr);
    if (!mounted) return;

    if (ok) {
      final msg = controller.attendanceActionSuccess == 'clock_out'
          ? strings.attendanceClockOutSuccess
          : strings.attendanceClockInSuccess;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      controller.clearAttendanceFeedback();
    }
  }

  String? _attendanceErrorMessage(AppStrings strings, String? error) {
    if (error == null) return null;
    if (error == 'no_open_check_in') {
      return strings.attendanceNoOpenCheckIn;
    }
    return error;
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final strings = AppStrings(locale);
    final session = context.watch<AuthSession>();
    final controller = context.watch<DashboardController>();
    final ext = MezanThemeExtension.of(context);

    if (!session.hasEmployeeProfile) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanEmptyState(
            title: strings.noEmployeeProfileTitle,
            message: strings.noEmployeeProfileBody,
            icon: Icons.badge_outlined,
          ),
        ],
      );
    }

    if (controller.isLoading && controller.state != DashboardLoadState.ready) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: MezanLoadingState(),
      );
    }

    if (controller.state == DashboardLoadState.error) {
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

    final todaySchedule = controller.todaySchedule;
    final nextSchedule = controller.nextWorkSchedule;
    final leave = controller.leaveBalance;
    final lastLog = controller.lastAttendanceLog;

    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (controller.attendanceActionError != null) ...[
            MezanErrorState(
              message: _attendanceErrorMessage(
                strings,
                controller.attendanceActionError,
              ),
            ),
            const SizedBox(height: 12),
          ],
          MezanCard(
            radius: MezanCardRadius.hero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        strings.todayAttendanceTitle,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    _statusBadge(context, strings, controller.todayStatus),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  _statusDescription(strings, controller.todayStatus),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: ext.mutedForeground,
                      ),
                ),
                if (controller.openShift != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    strings.attendanceSince(
                      formatDateTime(
                        controller.openShift!.clockInAt,
                        pattern: 'HH:mm',
                        locale: locale,
                      ),
                    ),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: ext.mutedForeground,
                        ),
                  ),
                ],
                if (controller.todayStatus != TodayAttendanceStatus.completed) ...[
                  const SizedBox(height: 20),
                  MezanButton(
                    label: controller.attendanceIntent == AttendanceIntent.checkOut
                        ? strings.attendanceCheckOutAction
                        : strings.attendanceCheckInAction,
                    icon: Icons.qr_code_scanner,
                    expand: true,
                    loading: controller.isBusy,
                    onPressed: controller.isBusy ? null : _scanAttendance,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: MezanStatCard(
                  label: strings.todaysShiftLabel,
                  value: _shiftValue(strings, todaySchedule),
                  subtitle: todaySchedule == null
                      ? strings.t('لا يوجد جدول', 'No schedule')
                      : todaySchedule.isDayOff
                          ? strings.dayOffLabel
                          : weekdayLabel(
                              todaySchedule.weekday,
                              arabic: strings.isArabic,
                            ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: MezanStatCard(
                  label: strings.leaveBalanceLabel,
                  value: formatLeaveDays(leave?.remainingDays),
                  subtitle: strings.leaveDaysRemaining,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (lastLog != null)
            MezanStatCard(
              label: strings.lastAttendanceLabel,
              value: formatRelativeAttendanceDate(
                lastLog.clockInAt,
                arabic: strings.isArabic,
              ),
              subtitle: lastLog.isOpen
                  ? strings.attendanceStatusOpen
                  : strings.attendanceStatusDone,
            ),
          if (todaySchedule != null || nextSchedule != null) ...[
            const SizedBox(height: 12),
            MezanCard(
              onTap: () {
                Navigator.of(context).push<void>(
                  MaterialPageRoute(
                    builder: (_) => WeekSchedulePage(
                      schedules: controller.schedules,
                    ),
                  ),
                );
              },
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          strings.schedulePreviewTitle,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      Icon(
                        Icons.chevron_left,
                        color: ext.mutedForeground,
                        size: 20,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (todaySchedule != null)
                    _ScheduleRow(
                      title: strings.t('اليوم', 'Today'),
                      schedule: todaySchedule,
                      arabic: strings.isArabic,
                    ),
                  if (nextSchedule != null) ...[
                    if (todaySchedule != null) const SizedBox(height: 8),
                    _ScheduleRow(
                      title: strings.nextShiftLabel,
                      schedule: nextSchedule,
                      arabic: strings.isArabic,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _shiftValue(AppStrings strings, WeeklyScheduleRead? schedule) {
    if (schedule == null) return '—';
    if (schedule.isDayOff) {
      return strings.dayOffLabel;
    }
    return '${formatApiTime(schedule.startTime)}–${formatApiTime(schedule.endTime)}';
  }

  String _statusDescription(AppStrings strings, TodayAttendanceStatus status) {
    return switch (status) {
      TodayAttendanceStatus.notCheckedIn => strings.attendanceStatusNotIn,
      TodayAttendanceStatus.checkedIn => strings.attendanceStatusIn,
      TodayAttendanceStatus.completed => strings.attendanceStatusDoneToday,
    };
  }

  Widget _statusBadge(
    BuildContext context,
    AppStrings strings,
    TodayAttendanceStatus status,
  ) {
    final (label, variant) = switch (status) {
      TodayAttendanceStatus.notCheckedIn => (
          strings.attendanceStatusNotIn,
          MezanBadgeVariant.muted,
        ),
      TodayAttendanceStatus.checkedIn => (
          strings.attendanceStatusIn,
          MezanBadgeVariant.success,
        ),
      TodayAttendanceStatus.completed => (
          strings.attendanceStatusDoneToday,
          MezanBadgeVariant.secondary,
        ),
    };
    return MezanBadge(label: label, variant: variant);
  }
}

class _ScheduleRow extends StatelessWidget {
  const _ScheduleRow({
    required this.title,
    required this.schedule,
    required this.arabic,
  });

  final String title;
  final WeeklyScheduleRead schedule;
  final bool arabic;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    final strings = AppStrings(arabic ? 'ar' : 'en');
    final detail = schedule.isDayOff
        ? strings.dayOffLabel
        : '${formatApiTime(schedule.startTime)}–${formatApiTime(schedule.endTime)}';

    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.labelLarge),
              Text(
                weekdayLabel(schedule.weekday, arabic: arabic),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: ext.mutedForeground,
                    ),
              ),
            ],
          ),
        ),
        MezanNumberText(
          detail,
          style: Theme.of(context).textTheme.titleSmall,
        ),
      ],
    );
  }
}

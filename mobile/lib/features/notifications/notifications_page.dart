import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/format_date.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_badge.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_empty_state.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import 'models/notification_delivery.dart';
import 'notifications_controller.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationsController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final locale = Localizations.localeOf(context).languageCode;
    final controller = context.watch<NotificationsController>();
    final ext = MezanThemeExtension.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.notificationsTitle),
        actions: [
          if (controller.unreadCount > 0)
            TextButton(
              onPressed: controller.isBusy ? null : controller.markAllRead,
              child: Text(strings.notificationsMarkAllRead),
            ),
        ],
      ),
      body: _buildBody(context, strings, locale, controller, ext),
    );
  }

  Widget _buildBody(
    BuildContext context,
    AppStrings strings,
    String locale,
    NotificationsController controller,
    MezanThemeExtension ext,
  ) {
    if (controller.isLoading && controller.state != NotificationsLoadState.ready) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: MezanLoadingState(),
      );
    }

    if (controller.state == NotificationsLoadState.error &&
        controller.items.isEmpty) {
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

    if (controller.items.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MezanEmptyState(
            title: strings.notificationsEmptyTitle,
            message: strings.notificationsEmptyBody,
            icon: Icons.notifications_none_outlined,
          ),
        ],
      );
    }

    final hasRead = controller.items.any((item) => !item.isUnread);

    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          if (controller.errorMessage != null) ...[
            MezanErrorState(message: controller.errorMessage),
            const SizedBox(height: 12),
          ],
          ...controller.items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _NotificationCard(
                item: item,
                strings: strings,
                locale: locale,
                onMarkRead: item.isUnread
                    ? () => controller.markRead(item.id)
                    : null,
              ),
            ),
          ),
          if (hasRead) ...[
            const SizedBox(height: 8),
            MezanButton(
              label: strings.notificationsClearRead,
              variant: MezanButtonVariant.outline,
              expand: true,
              loading: controller.isBusy,
              onPressed: controller.isBusy ? null : controller.clearRead,
            ),
          ],
        ],
      ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.item,
    required this.strings,
    required this.locale,
    this.onMarkRead,
  });

  final NotificationDeliveryRead item;
  final AppStrings strings;
  final String locale;
  final VoidCallback? onMarkRead;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    final unread = item.isUnread;
    final timeLabel = formatDateTime(
      item.displayTime,
      pattern: 'yyyy-MM-dd HH:mm',
      locale: locale,
    );

    return MezanCard(
      padding: const EdgeInsets.all(16),
      child: Opacity(
        opacity: unread ? 1 : 0.72,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    item.title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight:
                              unread ? FontWeight.w700 : FontWeight.w500,
                        ),
                  ),
                ),
                if (unread)
                  MezanBadge(
                    label: strings.notificationsUnreadBadge,
                    variant: MezanBadgeVariant.secondary,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              item.body,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: unread ? ext.foreground : ext.mutedForeground,
                  ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text(
                  timeLabel,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: ext.mutedForeground,
                      ),
                ),
                const Spacer(),
                if (onMarkRead != null)
                  TextButton(
                    onPressed: onMarkRead,
                    child: Text(strings.notificationsMarkRead),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

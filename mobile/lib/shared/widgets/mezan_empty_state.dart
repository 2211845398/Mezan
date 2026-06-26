import 'package:flutter/material.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import 'mezan_button.dart';
import 'mezan_card.dart';

class MezanEmptyState extends StatelessWidget {
  const MezanEmptyState({
    super.key,
    this.title,
    this.message,
    this.icon = Icons.inbox_outlined,
    this.actionLabel,
    this.onAction,
  });

  final String? title;
  final String? message;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final strings = AppStrings(locale);
    final ext = MezanThemeExtension.of(context);

    return MezanCard(
      radius: MezanCardRadius.hero,
      child: Column(
        children: [
          Icon(icon, size: 40, color: ext.mutedForeground),
          const SizedBox(height: 16),
          Text(
            title ?? strings.emptyTitle,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            message ?? strings.emptyBody,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: ext.mutedForeground,
                ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 20),
            MezanButton(
              label: actionLabel!,
              onPressed: onAction,
              variant: MezanButtonVariant.outline,
            ),
          ],
        ],
      ),
    );
  }
}

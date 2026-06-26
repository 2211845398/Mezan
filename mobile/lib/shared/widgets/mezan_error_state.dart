import 'package:flutter/material.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import 'mezan_button.dart';
import 'mezan_card.dart';

class MezanErrorState extends StatelessWidget {
  const MezanErrorState({
    super.key,
    this.title,
    this.message,
    this.onRetry,
  });

  final String? title;
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final ext = MezanThemeExtension.of(context);

    return MezanCard(
      child: Column(
        children: [
          Icon(Icons.error_outline, size: 40, color: ext.destructive),
          const SizedBox(height: 16),
          Text(
            title ?? strings.errorTitle,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            message ?? strings.errorNetwork,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: ext.mutedForeground,
                ),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: 20),
            MezanButton(
              label: strings.retry,
              onPressed: onRetry,
              variant: MezanButtonVariant.primary,
              expand: true,
            ),
          ],
        ],
      ),
    );
  }
}

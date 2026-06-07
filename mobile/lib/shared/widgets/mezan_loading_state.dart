import 'package:flutter/material.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import 'mezan_card.dart';
import 'mezan_shimmer.dart';

class MezanLoadingState extends StatelessWidget {
  const MezanLoadingState({
    super.key,
    this.message,
    this.useShimmer = true,
  });

  final String? message;
  final bool useShimmer;

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final ext = MezanThemeExtension.of(context);

    if (!useShimmer) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              message ?? strings.loading,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: ext.mutedForeground,
                  ),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MezanCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              MezanShimmerBox(height: 20, width: 160),
              SizedBox(height: 12),
              MezanShimmerBox(height: 14),
              SizedBox(height: 8),
              MezanShimmerBox(height: 14, width: 220),
            ],
          ),
        ),
        const SizedBox(height: 12),
        MezanCard(
          child: Column(
            children: List.generate(
              3,
              (i) => Padding(
                padding: EdgeInsets.only(bottom: i == 2 ? 0 : 12),
                child: const MezanShimmerBox(height: 48),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

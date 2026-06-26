import 'package:flutter/material.dart';

import '../../core/theme/mezan_colors.dart';
import '../../core/theme/mezan_theme.dart';

enum MezanBadgeVariant { primary, secondary, success, warning, destructive, muted }

class MezanBadge extends StatelessWidget {
  const MezanBadge({
    super.key,
    required this.label,
    this.variant = MezanBadgeVariant.primary,
  });

  final String label;
  final MezanBadgeVariant variant;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final scheme = Theme.of(context).colorScheme;

    final (bg, fg) = switch (variant) {
      MezanBadgeVariant.primary => (scheme.primary.withValues(alpha: 0.12), scheme.primary),
      MezanBadgeVariant.secondary =>
        (scheme.secondary.withValues(alpha: 0.16), scheme.secondary),
      MezanBadgeVariant.success => (
          MezanColors.successTint(ext.success, dark: dark),
          ext.success,
        ),
      MezanBadgeVariant.warning => (
          MezanColors.warningTint(ext.warning, dark: dark),
          ext.warning,
        ),
      MezanBadgeVariant.destructive => (
          MezanColors.destructiveTint(ext.destructive, dark: dark),
          ext.destructive,
        ),
      MezanBadgeVariant.muted => (ext.muted, ext.mutedForeground),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: fg,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}

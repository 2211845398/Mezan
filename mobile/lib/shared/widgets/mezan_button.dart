import 'package:flutter/material.dart';

import '../../core/theme/mezan_radii.dart';

enum MezanButtonVariant { primary, secondary, outline, ghost, destructive }

enum MezanButtonSize { sm, md, lg }

class MezanButton extends StatelessWidget {
  const MezanButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = MezanButtonVariant.primary,
    this.size = MezanButtonSize.md,
    this.icon,
    this.loading = false,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final MezanButtonVariant variant;
  final MezanButtonSize size;
  final IconData? icon;
  final bool loading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final height = switch (size) {
      MezanButtonSize.sm => 36.0,
      MezanButtonSize.md => 40.0,
      MezanButtonSize.lg => 44.0,
    };
    final horizontal = switch (size) {
      MezanButtonSize.sm => 12.0,
      MezanButtonSize.md => 16.0,
      MezanButtonSize.lg => 24.0,
    };

    final (bg, fg, border) = switch (variant) {
      MezanButtonVariant.primary => (scheme.primary, scheme.onPrimary, Colors.transparent),
      MezanButtonVariant.secondary => (scheme.secondary, scheme.onSecondary, Colors.transparent),
      MezanButtonVariant.outline => (
          Theme.of(context).scaffoldBackgroundColor,
          scheme.onSurface,
          Theme.of(context).dividerColor,
        ),
      MezanButtonVariant.ghost => (Colors.transparent, scheme.onSurface, Colors.transparent),
      MezanButtonVariant.destructive => (scheme.error, scheme.onError, Colors.transparent),
    };

    final child = loading
        ? SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: fg,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18, color: fg),
                const SizedBox(width: 8),
              ],
              Text(
                label,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(color: fg),
              ),
            ],
          );

    final button = Material(
      color: bg,
      borderRadius: BorderRadius.circular(MezanRadii.md),
      child: InkWell(
        onTap: loading ? null : onPressed,
        borderRadius: BorderRadius.circular(MezanRadii.md),
        splashColor: fg.withValues(alpha: 0.12),
        highlightColor: fg.withValues(alpha: 0.08),
        child: Container(
          height: height,
          padding: EdgeInsets.symmetric(horizontal: horizontal),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(MezanRadii.md),
            border: border == Colors.transparent ? null : Border.all(color: border),
          ),
          child: child,
        ),
      ),
    );

    if (!expand) return button;
    return SizedBox(width: double.infinity, child: button);
  }
}

import 'package:flutter/material.dart';

import '../../core/theme/mezan_radii.dart';
import '../../core/theme/mezan_shadows.dart';
import '../../core/theme/mezan_theme.dart';

enum MezanCardRadius { normal, hero }

class MezanCard extends StatelessWidget {
  const MezanCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.margin,
    this.radius = MezanCardRadius.normal,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final MezanCardRadius radius;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    final brightness = Theme.of(context).brightness;
    final borderRadius = BorderRadius.circular(
      radius == MezanCardRadius.hero ? MezanRadii.xl : MezanRadii.lg,
    );

    final content = Container(
      margin: margin,
      decoration: BoxDecoration(
        color: ext.card,
        borderRadius: borderRadius,
        border: Border.all(color: ext.border),
        boxShadow: MezanShadows.cardShadow(brightness),
      ),
      padding: padding,
      child: child,
    );

    if (onTap == null) return content;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: borderRadius,
        splashColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
        highlightColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.06),
        child: content,
      ),
    );
  }
}

class MezanCardHeader extends StatelessWidget {
  const MezanCardHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: ext.mutedForeground,
                      ),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

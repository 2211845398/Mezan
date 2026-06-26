import 'package:flutter/material.dart';

import '../../core/theme/mezan_theme.dart';

/// Flat label + value row for read-only detail screens.
class MezanReadOnlyField extends StatelessWidget {
  const MezanReadOnlyField({
    super.key,
    required this.label,
    required this.value,
    this.dir,
  });

  final String label;
  final String value;
  final TextDirection? dir;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: ext.mutedForeground,
              ),
        ),
        const SizedBox(height: 6),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: ext.muted.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            value,
            textDirection: dir,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';

import '../../core/theme/mezan_theme.dart';
import 'mezan_card.dart';
import 'mezan_number_text.dart';

class MezanStatCard extends StatelessWidget {
  const MezanStatCard({
    super.key,
    required this.label,
    required this.value,
    this.subtitle,
  });

  final String label;
  final String value;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    return MezanCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: ext.mutedForeground,
                ),
          ),
          const SizedBox(height: 8),
          MezanNumberText(
            value,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
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
    );
  }
}

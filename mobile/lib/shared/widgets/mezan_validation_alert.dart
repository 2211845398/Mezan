import 'package:flutter/material.dart';

import '../../core/theme/mezan_theme.dart';

class MezanValidationAlert extends StatelessWidget {
  const MezanValidationAlert({
    super.key,
    required this.message,
  });

  final String message;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: ext.destructive.withOpacity(0.10),
        border: Border.all(color: ext.destructive.withOpacity(0.30)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        message,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: ext.destructive,
            ),
      ),
    );
  }
}

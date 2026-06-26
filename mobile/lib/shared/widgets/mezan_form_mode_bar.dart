import 'package:flutter/material.dart';

import 'mezan_button.dart';

/// Save / cancel bar shown while a detail form is in edit mode (RTL-first row).
class MezanFormModeBar extends StatelessWidget {
  const MezanFormModeBar({
    super.key,
    required this.saveLabel,
    required this.cancelLabel,
    required this.onSave,
    required this.onCancel,
    this.loading = false,
  });

  final String saveLabel;
  final String cancelLabel;
  final VoidCallback onSave;
  final VoidCallback onCancel;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: MezanButton(
            label: saveLabel,
            loading: loading,
            onPressed: loading ? null : onSave,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: MezanButton(
            label: cancelLabel,
            variant: MezanButtonVariant.outline,
            onPressed: loading ? null : onCancel,
          ),
        ),
      ],
    );
  }
}

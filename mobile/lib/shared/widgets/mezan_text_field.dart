import 'package:flutter/material.dart';

import '../../core/theme/mezan_theme.dart';

class MezanTextField extends StatelessWidget {
  const MezanTextField({
    super.key,
    this.controller,
    this.label,
    this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.maxLines = 1,
    this.onChanged,
    this.onSubmitted,
    this.validator,
    this.errorText,
    this.textInputAction,
    this.suffixIcon,
    this.readOnly = false,
    this.enabled = true,
  });

  final TextEditingController? controller;
  final String? label;
  final String? hint;
  final Widget? suffixIcon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final String? Function(String?)? validator;
  final String? errorText;
  final TextInputAction? textInputAction;
  final bool readOnly;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final ext = Theme.of(context).extension<MezanThemeExtension>();
    final flatReadOnly = readOnly || !enabled;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (label != null) ...[
          Text(label!, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
        ],
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          keyboardType: keyboardType,
          maxLines: maxLines,
          onChanged: onChanged,
          onFieldSubmitted: onSubmitted,
          textInputAction: textInputAction,
          validator: validator,
          readOnly: readOnly,
          enabled: enabled,
          style: Theme.of(context).textTheme.bodyMedium,
          decoration: InputDecoration(
            hintText: hint,
            suffixIcon: suffixIcon,
            errorText: errorText,
            errorStyle: const TextStyle(fontSize: 0, height: 0),
            filled: flatReadOnly,
            fillColor: flatReadOnly
                ? ext?.muted.withValues(alpha: 0.35)
                : null,
            border: flatReadOnly ? InputBorder.none : null,
            enabledBorder: flatReadOnly ? InputBorder.none : null,
            focusedBorder: flatReadOnly ? InputBorder.none : null,
            disabledBorder: flatReadOnly ? InputBorder.none : null,
          ),
        ),
      ],
    );
  }
}

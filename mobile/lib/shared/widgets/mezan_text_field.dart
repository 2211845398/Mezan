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

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
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
          style: Theme.of(context).textTheme.bodyMedium,
          decoration: InputDecoration(
            hintText: hint,
            suffixIcon: suffixIcon,
            errorText: errorText,
            errorStyle: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: ext.destructive,
                ),
          ),
        ),
      ],
    );
  }
}

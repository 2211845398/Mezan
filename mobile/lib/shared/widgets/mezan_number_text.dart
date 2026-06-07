import 'package:flutter/material.dart';

import '../../core/format/latin_digits.dart';
import '../../core/theme/mezan_typography.dart';

/// Tabular Latin digits for money, dates, IDs (web `.num-latin`).
class MezanNumberText extends StatelessWidget {
  const MezanNumberText(
    this.data, {
    super.key,
    this.style,
    this.textAlign,
    this.maxLines,
    this.overflow,
  });

  final String data;
  final TextStyle? style;
  final TextAlign? textAlign;
  final int? maxLines;
  final TextOverflow? overflow;

  @override
  Widget build(BuildContext context) {
    final base = style ?? Theme.of(context).textTheme.bodyMedium;
    return Text(
      toLatinDigits(data),
      textAlign: textAlign,
      maxLines: maxLines,
      overflow: overflow,
      style: MezanTypography.numbers(
        fontSize: base?.fontSize,
        fontWeight: base?.fontWeight,
        color: base?.color,
        height: base?.height,
      ),
    );
  }
}

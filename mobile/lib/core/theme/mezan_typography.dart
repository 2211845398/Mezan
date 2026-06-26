import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tajawal for Arabic, Inter for English and tabular numbers.
abstract final class MezanTypography {
  static TextStyle arabic({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
  }) {
    return GoogleFonts.tajawal(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      height: height,
    );
  }

  static TextStyle latin({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
  }) {
    return GoogleFonts.inter(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      height: height,
    );
  }

  static TextStyle numbers({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
  }) {
    return GoogleFonts.inter(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      height: height,
    ).copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
  }

  static TextTheme textTheme({
    required bool isArabic,
    required Color foreground,
    required Color mutedForeground,
  }) {
    final body = isArabic ? arabic : latin;
    return TextTheme(
      headlineLarge: body(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        color: foreground,
      ),
      headlineMedium: body(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: foreground,
      ),
      titleLarge: body(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
      titleMedium: body(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
      bodyLarge: body(fontSize: 16, fontWeight: FontWeight.w400, color: foreground),
      bodyMedium: body(fontSize: 14, fontWeight: FontWeight.w400, color: foreground),
      bodySmall: body(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        color: mutedForeground,
      ),
      labelLarge: body(fontSize: 14, fontWeight: FontWeight.w500, color: foreground),
      labelMedium: body(fontSize: 12, fontWeight: FontWeight.w500, color: mutedForeground),
    );
  }
}

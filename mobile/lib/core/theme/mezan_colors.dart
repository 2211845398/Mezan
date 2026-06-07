import 'package:flutter/material.dart';

/// Brand and semantic colors mapped from [web/src/styles/tokens.css].
abstract final class MezanColors {
  static Color hsl(double h, double s, double l, [double a = 1]) {
    return HSLColor.fromAHSL(a, h, s / 100, l / 100).toColor();
  }

  // Brand references
  static const palmGreen = Color(0xFF003218);
  static const crownGold = Color(0xFFAA8E60);

  // Light theme
  static final lightBackground = hsl(0, 0, 100);
  static final lightForeground = hsl(149, 100, 10);
  static final lightCard = hsl(0, 0, 100);
  static final lightCardForeground = hsl(149, 100, 10);
  static final lightPrimary = hsl(149, 100, 10);
  static final lightPrimaryForeground = hsl(0, 0, 100);
  static final lightSecondary = hsl(37, 30, 52);
  static final lightSecondaryForeground = hsl(149, 100, 10);
  static final lightMuted = hsl(149, 14, 96);
  static final lightMutedForeground = hsl(149, 16, 36);
  static final lightAccent = hsl(37, 28, 94);
  static final lightDestructive = hsl(0, 84.2, 60.2);
  static final lightDestructiveForeground = hsl(0, 0, 100);
  static final lightSuccess = hsl(142.1, 76.2, 36.3);
  static final lightWarning = hsl(32, 94, 44);
  static final lightBorder = hsl(149, 12, 88);
  static final lightInput = hsl(149, 12, 88);
  static final lightRing = hsl(149, 55, 32);

  // Dark theme
  static final darkBackground = hsl(149, 38, 8);
  static final darkForeground = hsl(40, 25, 96);
  static final darkCard = hsl(149, 34, 10);
  static final darkCardForeground = hsl(40, 25, 96);
  static final darkPrimary = hsl(149, 48, 42);
  static final darkPrimaryForeground = hsl(149, 100, 6);
  static final darkSecondary = hsl(37, 32, 46);
  static final darkSecondaryForeground = hsl(149, 100, 6);
  static final darkMuted = hsl(149, 28, 14);
  static final darkMutedForeground = hsl(40, 12, 72);
  static final darkAccent = hsl(149, 26, 16);
  static final darkDestructive = hsl(0, 62.8, 30.6);
  static final darkDestructiveForeground = hsl(40, 25, 96);
  static final darkSuccess = hsl(142.1, 70.6, 45.3);
  static final darkWarning = hsl(32, 94, 60);
  static final darkBorder = hsl(149, 22, 18);
  static final darkInput = hsl(149, 22, 18);
  static final darkRing = hsl(37, 45, 55);

  static Color successTint(Color success, {bool dark = false}) {
    return success.withValues(alpha: dark ? 0.22 : 0.12);
  }

  static Color warningTint(Color warning, {bool dark = false}) {
    return warning.withValues(alpha: dark ? 0.22 : 0.14);
  }

  static Color destructiveTint(Color destructive, {bool dark = false}) {
    return destructive.withValues(alpha: dark ? 0.28 : 0.12);
  }
}

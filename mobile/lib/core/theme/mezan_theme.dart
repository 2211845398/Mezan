import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'mezan_colors.dart';
import 'mezan_radii.dart';
import 'mezan_typography.dart';

abstract final class MezanTheme {
  static ThemeData light({required bool isArabic}) => _build(
        brightness: Brightness.light,
        isArabic: isArabic,
        background: MezanColors.lightBackground,
        foreground: MezanColors.lightForeground,
        card: MezanColors.lightCard,
        primary: MezanColors.lightPrimary,
        onPrimary: MezanColors.lightPrimaryForeground,
        secondary: MezanColors.lightSecondary,
        onSecondary: MezanColors.lightSecondaryForeground,
        muted: MezanColors.lightMuted,
        mutedForeground: MezanColors.lightMutedForeground,
        destructive: MezanColors.lightDestructive,
        border: MezanColors.lightBorder,
        input: MezanColors.lightInput,
        ring: MezanColors.lightRing,
      );

  static ThemeData dark({required bool isArabic}) => _build(
        brightness: Brightness.dark,
        isArabic: isArabic,
        background: MezanColors.darkBackground,
        foreground: MezanColors.darkForeground,
        card: MezanColors.darkCard,
        primary: MezanColors.darkPrimary,
        onPrimary: MezanColors.darkPrimaryForeground,
        secondary: MezanColors.darkSecondary,
        onSecondary: MezanColors.darkSecondaryForeground,
        muted: MezanColors.darkMuted,
        mutedForeground: MezanColors.darkMutedForeground,
        destructive: MezanColors.darkDestructive,
        border: MezanColors.darkBorder,
        input: MezanColors.darkInput,
        ring: MezanColors.darkRing,
      );

  static ThemeData _build({
    required Brightness brightness,
    required bool isArabic,
    required Color background,
    required Color foreground,
    required Color card,
    required Color primary,
    required Color onPrimary,
    required Color secondary,
    required Color onSecondary,
    required Color muted,
    required Color mutedForeground,
    required Color destructive,
    required Color border,
    required Color input,
    required Color ring,
  }) {
    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: primary,
      onPrimary: onPrimary,
      secondary: secondary,
      onSecondary: onSecondary,
      surface: card,
      onSurface: foreground,
      error: destructive,
      onError: onPrimary,
    );

    final textTheme = MezanTypography.textTheme(
      isArabic: isArabic,
      foreground: foreground,
      mutedForeground: mutedForeground,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: background,
      colorScheme: colorScheme,
      textTheme: textTheme,
      primaryColor: primary,
      canvasColor: background,
      dividerColor: border,
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: background,
        foregroundColor: foreground,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
        systemOverlayStyle: brightness == Brightness.dark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
      ),
      cardTheme: CardThemeData(
        color: card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MezanRadii.lg),
          side: BorderSide(color: border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: background,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MezanRadii.md),
          borderSide: BorderSide(color: input),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MezanRadii.md),
          borderSide: BorderSide(color: input),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MezanRadii.md),
          borderSide: BorderSide(color: ring, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MezanRadii.md),
          borderSide: BorderSide(color: destructive),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MezanRadii.md),
          borderSide: BorderSide(color: destructive, width: 1.5),
        ),
        hintStyle: textTheme.bodyMedium?.copyWith(color: mutedForeground),
        labelStyle: textTheme.labelMedium,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MezanRadii.md),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 64,
        backgroundColor: card,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        indicatorColor: Colors.transparent,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return textTheme.labelMedium?.copyWith(
              color: secondary,
              fontWeight: FontWeight.w600,
            );
          }
          return textTheme.labelMedium?.copyWith(color: mutedForeground);
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return IconThemeData(color: secondary, size: 24);
          }
          return IconThemeData(color: mutedForeground, size: 24);
        }),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          visualDensity: VisualDensity.compact,
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(MezanRadii.md),
            ),
          ),
          side: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return BorderSide(color: secondary);
            }
            return BorderSide(color: border);
          }),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return secondary;
            }
            return background;
          }),
          foregroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return Colors.white;
            }
            return foreground;
          }),
        ),
      ),
      splashFactory: NoSplash.splashFactory,
      highlightColor: secondary.withValues(alpha: 0.08),
    );
  }
}

/// Semantic colors exposed on [ThemeExtension] for widgets.
@immutable
class MezanThemeExtension extends ThemeExtension<MezanThemeExtension> {
  const MezanThemeExtension({
    required this.card,
    required this.foreground,
    required this.muted,
    required this.mutedForeground,
    required this.border,
    required this.ring,
    required this.success,
    required this.warning,
    required this.destructive,
    required this.isArabic,
  });

  final Color card;
  final Color foreground;
  final Color muted;
  final Color mutedForeground;
  final Color border;
  final Color ring;
  final Color success;
  final Color warning;
  final Color destructive;
  final bool isArabic;

  static MezanThemeExtension of(BuildContext context) {
    return Theme.of(context).extension<MezanThemeExtension>()!;
  }

  @override
  MezanThemeExtension copyWith({
    Color? card,
    Color? foreground,
    Color? muted,
    Color? mutedForeground,
    Color? border,
    Color? ring,
    Color? success,
    Color? warning,
    Color? destructive,
    bool? isArabic,
  }) {
    return MezanThemeExtension(
      card: card ?? this.card,
      foreground: foreground ?? this.foreground,
      muted: muted ?? this.muted,
      mutedForeground: mutedForeground ?? this.mutedForeground,
      border: border ?? this.border,
      ring: ring ?? this.ring,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      destructive: destructive ?? this.destructive,
      isArabic: isArabic ?? this.isArabic,
    );
  }

  @override
  MezanThemeExtension lerp(ThemeExtension<MezanThemeExtension>? other, double t) {
    if (other is! MezanThemeExtension) return this;
    return MezanThemeExtension(
      card: Color.lerp(card, other.card, t)!,
      foreground: Color.lerp(foreground, other.foreground, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      mutedForeground: Color.lerp(mutedForeground, other.mutedForeground, t)!,
      border: Color.lerp(border, other.border, t)!,
      ring: Color.lerp(ring, other.ring, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      destructive: Color.lerp(destructive, other.destructive, t)!,
      isArabic: t < 0.5 ? isArabic : other.isArabic,
    );
  }
}

ThemeData applyMezanExtension(ThemeData base, {required bool isArabic}) {
  final dark = base.brightness == Brightness.dark;
  return base.copyWith(
    extensions: [
      MezanThemeExtension(
        card: base.colorScheme.surface,
        foreground: base.colorScheme.onSurface,
        muted: dark ? MezanColors.darkMuted : MezanColors.lightMuted,
        mutedForeground:
            dark ? MezanColors.darkMutedForeground : MezanColors.lightMutedForeground,
        border: dark ? MezanColors.darkBorder : MezanColors.lightBorder,
        ring: dark ? MezanColors.darkRing : MezanColors.lightRing,
        success: dark ? MezanColors.darkSuccess : MezanColors.lightSuccess,
        warning: dark ? MezanColors.darkWarning : MezanColors.lightWarning,
        destructive: dark ? MezanColors.darkDestructive : MezanColors.lightDestructive,
        isArabic: isArabic,
      ),
    ],
  );
}

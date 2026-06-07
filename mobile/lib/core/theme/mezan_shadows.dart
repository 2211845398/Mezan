import 'package:flutter/material.dart';

/// Soft elevations aligned with web shadow-sm.
abstract final class MezanShadows {
  static List<BoxShadow> cardShadow(Brightness brightness) {
    final opacity = brightness == Brightness.dark ? 0.35 : 0.08;
    return [
      BoxShadow(
        color: Colors.black.withValues(alpha: opacity),
        blurRadius: 3,
        offset: const Offset(0, 1),
      ),
      BoxShadow(
        color: Colors.black.withValues(alpha: opacity * 0.6),
        blurRadius: 2,
        offset: const Offset(0, 1),
      ),
    ];
  }
}

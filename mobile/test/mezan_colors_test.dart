import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/mezan_colors.dart';

void main() {
  group('MezanColors', () {
    test('brand hex colors match web tokens', () {
      expect(MezanColors.palmGreen, const Color(0xFF003218));
      expect(MezanColors.crownGold, const Color(0xFFAA8E60));
    });

    test('light primary is deep palm green hue', () {
      final hsl = HSLColor.fromColor(MezanColors.lightPrimary);
      expect(hsl.hue, closeTo(149, 1));
      expect(hsl.lightness, lessThan(0.2));
    });

    test('dark secondary is gold tone', () {
      final hsl = HSLColor.fromColor(MezanColors.darkSecondary);
      expect(hsl.hue, closeTo(37, 2));
    });

    test('semantic tints use alpha', () {
      final tint = MezanColors.successTint(MezanColors.lightSuccess);
      expect(tint.a, closeTo(0.12, 0.01));
    });
  });
}

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

/// Enables mouse wheel / trackpad scrolling on Flutter Web (Chrome).
class MezanScrollBehavior extends MaterialScrollBehavior {
  const MezanScrollBehavior();

  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.trackpad,
        PointerDeviceKind.stylus,
        PointerDeviceKind.unknown,
      };
}

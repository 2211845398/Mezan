import 'package:flutter/material.dart';

import '../../core/theme/mezan_theme.dart';

/// Top notification cards similar to web Sonner toasts.
abstract final class MezanNotify {
  static void error(BuildContext context, String message) {
    _show(context, message, isError: true);
  }

  static void success(BuildContext context, String message) {
    _show(context, message, isError: false);
  }

  static void _show(
    BuildContext context,
    String message, {
    required bool isError,
  }) {
    final ext = MezanThemeExtension.of(context);
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: TextStyle(
            color: isError ? Colors.white : ext.foreground,
          ),
        ),
        backgroundColor: isError ? ext.destructive : ext.card,
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.only(
          left: 16,
          right: 16,
          top: MediaQuery.paddingOf(context).top + 8,
          bottom: MediaQuery.sizeOf(context).height - 120,
        ),
        duration: const Duration(seconds: 5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: isError ? ext.destructive : ext.border,
          ),
        ),
      ),
    );
  }
}

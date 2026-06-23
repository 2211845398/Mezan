import 'package:flutter/material.dart';

import 'mezan_button.dart';

/// App bar actions for detail screens: edit in view mode; optional secondary actions.
class MezanDetailScaffold extends StatelessWidget {
  const MezanDetailScaffold({
    super.key,
    required this.title,
    required this.body,
    this.editLabel,
    this.onEdit,
    this.secondaryActions = const [],
    this.showBack = true,
  });

  final String title;
  final Widget body;
  final String? editLabel;
  final VoidCallback? onEdit;
  final List<Widget> secondaryActions;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: showBack,
        title: Text(title),
        actions: [
          ...secondaryActions,
          if (editLabel != null && onEdit != null)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: MezanButton(
                label: editLabel!,
                onPressed: onEdit,
              ),
            ),
        ],
      ),
      body: body,
    );
  }
}

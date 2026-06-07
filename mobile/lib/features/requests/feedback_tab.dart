import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_badge.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_text_field.dart';
import 'requests_controller.dart';

class FeedbackTab extends StatefulWidget {
  const FeedbackTab({super.key});

  @override
  State<FeedbackTab> createState() => _FeedbackTabState();
}

class _FeedbackTabState extends State<FeedbackTab> {
  final _messageController = TextEditingController();
  String? _category = 'issue';

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final message = _messageController.text.trim();
    if (message.length < 3) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            AppStrings(Localizations.localeOf(context).languageCode)
                .feedbackMessageTooShort,
          ),
        ),
      );
      return;
    }

    final controller = context.read<RequestsController>();
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final ok = await controller.submitFeedback(
      message: message,
      category: _category,
    );
    if (!mounted || !ok) return;

    _messageController.clear();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(strings.feedbackSubmitSuccess)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final controller = context.watch<RequestsController>();
    final ext = MezanThemeExtension.of(context);

    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (controller.feedbackSubmitError != null) ...[
            MezanErrorState(message: controller.feedbackSubmitError),
            const SizedBox(height: 12),
          ],
          if (!controller.canSubmitFeedback) ...[
            MezanCard(
              child: Text(
                strings.feedbackPendingLimitMessage,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: ext.mutedForeground,
                    ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          MezanCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  strings.feedbackFormTitle,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                Text(
                  strings.feedbackCategoryLabel,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                const SizedBox(height: 8),
                SegmentedButton<String?>(
                  segments: [
                    ButtonSegment(
                      value: 'issue',
                      label: Text(strings.feedbackCategoryIssue),
                    ),
                    ButtonSegment(
                      value: 'suggestion',
                      label: Text(strings.feedbackCategorySuggestion),
                    ),
                    ButtonSegment(
                      value: 'question',
                      label: Text(strings.feedbackCategoryQuestion),
                    ),
                  ],
                  selected: {_category},
                  emptySelectionAllowed: false,
                  showSelectedIcon: false,
                  onSelectionChanged: (set) {
                    if (set.isNotEmpty) setState(() => _category = set.first);
                  },
                ),
                const SizedBox(height: 16),
                MezanTextField(
                  controller: _messageController,
                  label: strings.feedbackMessageLabel,
                  hint: strings.feedbackMessageHint,
                  maxLines: 5,
                ),
                const SizedBox(height: 16),
                MezanButton(
                  label: strings.feedbackSubmitButton,
                  expand: true,
                  loading: controller.isSubmittingFeedback,
                  onPressed: controller.isSubmittingFeedback ||
                          !controller.canSubmitFeedback
                      ? null
                      : _submit,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            strings.feedbackHistoryTitle,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: ext.mutedForeground,
                ),
          ),
          const SizedBox(height: 8),
          if (controller.feedbackItems.isEmpty)
            MezanCard(
              child: Text(
                strings.feedbackHistoryEmpty,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: ext.mutedForeground,
                    ),
              ),
            )
          else
            ...controller.feedbackItems.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MezanCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          if (item.category != null)
                            MezanBadge(
                              label: _categoryLabel(strings, item.category!),
                              variant: MezanBadgeVariant.muted,
                            ),
                          const Spacer(),
                          Text(
                            item.createdAt.substring(0, 10),
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: ext.mutedForeground),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(item.message),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _categoryLabel(AppStrings strings, String category) {
    return switch (category) {
      'suggestion' => strings.feedbackCategorySuggestion,
      'question' => strings.feedbackCategoryQuestion,
      _ => strings.feedbackCategoryIssue,
    };
  }
}

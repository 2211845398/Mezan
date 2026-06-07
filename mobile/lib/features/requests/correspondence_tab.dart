import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_empty_state.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import '../../shared/widgets/mezan_text_field.dart';
import 'correspondence_repository.dart';
import 'correspondence_thread_page.dart';
import 'models/correspondence_thread.dart';

class CorrespondenceTab extends StatefulWidget {
  const CorrespondenceTab({super.key});

  @override
  State<CorrespondenceTab> createState() => _CorrespondenceTabState();
}

class _CorrespondenceTabState extends State<CorrespondenceTab> {
  List<CorrespondenceThreadRead> _threads = const [];
  var _loading = true;
  String? _error;

  final _subject = TextEditingController();
  final _body = TextEditingController();
  String _targetRole = 'HR_MANAGER';
  var _showForm = false;
  var _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await context.read<CorrespondenceRepository>().listMyThreads();
      if (!mounted) return;
      setState(() {
        _threads = rows;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ApiException ? e.message : 'Network error';
        _loading = false;
      });
    }
  }

  Future<void> _submit() async {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    if (_subject.text.trim().length < 2 || _body.text.trim().length < 3) return;
    setState(() => _sending = true);
    try {
      await context.read<CorrespondenceRepository>().createThread(
            subject: _subject.text.trim(),
            requestType: 'general',
            targetRoleCode: _targetRole,
            body: _body.text.trim(),
          );
      _subject.clear();
      _body.clear();
      setState(() => _showForm = false);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(strings.correspondenceSent)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e is ApiException ? e.message : 'Network error'),
        ),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final ext = MezanThemeExtension.of(context);

    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: MezanLoadingState(),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_error != null)
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        MezanButton(
          label: strings.correspondenceNewTitle,
          icon: Icons.mail_outline,
          expand: true,
          onPressed: () => setState(() => _showForm = !_showForm),
        ),
        if (_showForm) ...[
          const SizedBox(height: 12),
          MezanCard(
            child: Column(
              children: [
                MezanTextField(
                  controller: _subject,
                  label: strings.correspondenceSubject,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: _targetRole,
                  decoration: InputDecoration(labelText: strings.correspondenceTargetRole),
                  items: const [
                    DropdownMenuItem(value: 'HR_MANAGER', child: Text('HR')),
                    DropdownMenuItem(value: 'IT_ADMIN', child: Text('IT')),
                    DropdownMenuItem(value: 'OWNER', child: Text('Owner')),
                    DropdownMenuItem(value: 'MARKETING_MANAGER', child: Text('Sales')),
                    DropdownMenuItem(value: 'ACCOUNTANT', child: Text('Finance')),
                  ],
                  onChanged: (v) {
                    if (v != null) setState(() => _targetRole = v);
                  },
                ),
                const SizedBox(height: 12),
                MezanTextField(
                  controller: _body,
                  label: strings.correspondenceMessage,
                  maxLines: 4,
                ),
                const SizedBox(height: 12),
                MezanButton(
                  label: strings.correspondenceSend,
                  expand: true,
                  loading: _sending,
                  onPressed: _sending ? null : _submit,
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        if (_threads.isEmpty)
          MezanEmptyState(
            title: strings.correspondenceEmpty,
            icon: Icons.forum_outlined,
          )
        else
          ..._threads.map(
            (thread) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: MezanCard(
                child: ListTile(
                  title: Text(thread.subject),
                  subtitle: Text(
                    '${thread.targetRoleCode} · ${thread.status}',
                    style: TextStyle(color: ext.mutedForeground),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.of(context).push<void>(
                      MaterialPageRoute(
                        builder: (_) => CorrespondenceThreadPage(threadId: thread.id),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
      ],
    );
  }
}

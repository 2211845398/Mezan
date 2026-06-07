import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_strings.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_card.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import '../../shared/widgets/mezan_text_field.dart';
import 'correspondence_repository.dart';
import 'models/correspondence_thread.dart';

class CorrespondenceThreadPage extends StatefulWidget {
  const CorrespondenceThreadPage({super.key, required this.threadId});

  final int threadId;

  @override
  State<CorrespondenceThreadPage> createState() => _CorrespondenceThreadPageState();
}

class _CorrespondenceThreadPageState extends State<CorrespondenceThreadPage> {
  CorrespondenceThreadDetail? _detail;
  var _loading = true;
  final _reply = TextEditingController();
  var _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final detail =
        await context.read<CorrespondenceRepository>().getThread(widget.threadId);
    if (!mounted) return;
    setState(() {
      _detail = detail;
      _loading = false;
    });
  }

  Future<void> _sendReply() async {
    final body = _reply.text.trim();
    if (body.isEmpty) return;
    setState(() => _sending = true);
    await context.read<CorrespondenceRepository>().postMessage(
          threadId: widget.threadId,
          body: body,
        );
    _reply.clear();
    await _load();
    if (mounted) setState(() => _sending = false);
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);

    return Scaffold(
      appBar: AppBar(title: Text(_detail?.subject ?? '…')),
      body: _loading || _detail == null
          ? const MezanLoadingState()
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ..._detail!.messages.map(
                  (m) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: MezanCard(child: Text(m.body)),
                  ),
                ),
                if (_detail!.status != 'closed') ...[
                  MezanTextField(
                    controller: _reply,
                    label: strings.correspondenceReply,
                    maxLines: 3,
                  ),
                  const SizedBox(height: 12),
                  MezanButton(
                    label: strings.correspondenceSend,
                    expand: true,
                    loading: _sending,
                    onPressed: _sending ? null : _sendReply,
                  ),
                ],
              ],
            ),
    );
  }
}

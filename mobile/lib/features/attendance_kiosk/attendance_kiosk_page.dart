import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api/api_exception.dart';
import '../../core/i18n/app_strings.dart';
import '../../core/theme/mezan_theme.dart';
import '../../features/auth/auth_session.dart';
import '../../shared/widgets/mezan_button.dart';
import '../../shared/widgets/mezan_error_state.dart';
import '../../shared/widgets/mezan_loading_state.dart';
import 'attendance_kiosk_repository.dart';
import 'models/attendance_qr_payload.dart';

class AttendanceKioskPage extends StatefulWidget {
  const AttendanceKioskPage({super.key});

  @override
  State<AttendanceKioskPage> createState() => _AttendanceKioskPageState();
}

class _AttendanceKioskPageState extends State<AttendanceKioskPage> {
  AttendanceQrPayload? _displayedPayload;
  int? _waitingBaselineVersion;
  String? _error;
  var _loading = true;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _pollOnce(initial: true).whenComplete(_startPolling);
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) => _pollOnce());
  }

  Future<void> _pollOnce({bool initial = false}) async {
    if (!mounted) return;
    try {
      final repo = context.read<AttendanceKioskRepository>();
      final payload = await repo.fetchCurrentQr();
      if (!mounted) return;

      final version = payload.tokenVersion;
      if (version == null) {
        setState(() {
          _error = 'Invalid QR payload';
          _loading = false;
        });
        return;
      }

      final now = DateTime.now().toUtc();
      final expiresAt = payload.expiresAt;

      if (initial && _waitingBaselineVersion == null) {
        _waitingBaselineVersion = version;
      }

      if (_displayedPayload != null) {
        final displayedExpiresAt = _displayedPayload!.expiresAt;
        final expired = displayedExpiresAt != null &&
            !now.isBefore(displayedExpiresAt);
        if (expired) {
          setState(() {
            _displayedPayload = null;
            _waitingBaselineVersion = version;
            _error = null;
            _loading = false;
          });
          return;
        }
        setState(() {
          _displayedPayload = payload;
          _error = null;
          _loading = false;
        });
        return;
      }

      final baseline = _waitingBaselineVersion ?? version;
      if (version > baseline) {
        setState(() {
          _displayedPayload = payload;
          _error = null;
          _loading = false;
        });
        return;
      }

      setState(() {
        _error = null;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Network error';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final session = context.watch<AuthSession>();
    final ext = MezanThemeExtension.of(context);
    final showingQr = _displayedPayload != null;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      strings.kioskTitle,
                      style: Theme.of(context).textTheme.headlineSmall,
                      textAlign: TextAlign.center,
                    ),
                  ),
                  IconButton(
                    tooltip: strings.signOut,
                    onPressed: () => session.signOut(),
                    icon: const Icon(Icons.logout),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (session.branchName != null)
                Text(
                  strings.kioskBranch(session.branchName!),
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: ext.mutedForeground,
                      ),
                  textAlign: TextAlign.center,
                ),
              const Spacer(),
              if (_loading)
                const MezanLoadingState()
              else if (_error != null)
                MezanErrorState(
                  message: _error!,
                  onRetry: () => _pollOnce(),
                )
              else if (showingQr) ...[
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: QrImageView(
                    data: _displayedPayload!.qrPayload,
                    size: 280,
                    backgroundColor: Colors.white,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  strings.kioskQrReady,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: ext.mutedForeground,
                      ),
                  textAlign: TextAlign.center,
                ),
              ]
              else ...[
                Icon(
                  Icons.hourglass_top_outlined,
                  size: 72,
                  color: ext.mutedForeground,
                ),
                const SizedBox(height: 24),
                Text(
                  strings.kioskWaiting,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: ext.mutedForeground,
                      ),
                  textAlign: TextAlign.center,
                ),
              ],
              const Spacer(),
              MezanButton(
                label: strings.retry,
                expand: true,
                onPressed: () => _pollOnce(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

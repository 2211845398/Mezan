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
  String? _error;
  var _generating = false;
  Timer? _expiryTimer;

  @override
  void dispose() {
    _expiryTimer?.cancel();
    super.dispose();
  }

  void _scheduleExpiryCheck() {
    _expiryTimer?.cancel();
    final expiresAt = _displayedPayload?.expiresAt;
    if (expiresAt == null) return;

    _expiryTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final now = DateTime.now().toUtc();
      if (!now.isBefore(expiresAt)) {
        setState(() {
          _displayedPayload = null;
          _error = null;
        });
        _expiryTimer?.cancel();
      }
    });
  }

  Future<void> _generateQr() async {
    if (_generating) return;
    setState(() {
      _generating = true;
      _error = null;
    });

    try {
      final repo = context.read<AttendanceKioskRepository>();
      final payload = await repo.generateQr();
      if (!mounted) return;
      setState(() {
        _displayedPayload = payload;
        _generating = false;
      });
      _scheduleExpiryCheck();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _generating = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Network error';
        _generating = false;
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
              if (_generating)
                const MezanLoadingState()
              else if (_error != null)
                MezanErrorState(message: _error!)
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
              ] else ...[
                Icon(
                  Icons.qr_code_2_outlined,
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
                label: strings.kioskGenerateQr,
                expand: true,
                loading: _generating,
                icon: Icons.qr_code,
                onPressed: _generating ? null : _generateQr,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

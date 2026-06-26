import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../features/attendance_kiosk/attendance_kiosk_page.dart';
import '../features/auth/auth_gate.dart';
import '../features/auth/auth_session.dart';
import 'employee_shell.dart';

GoRouter createAppRouter(AuthSession session) {
  final kioskMode = session.isAuthenticated && session.isAttendanceKiosk;

  if (kioskMode) {
    return GoRouter(
      initialLocation: '/kiosk',
      refreshListenable: session,
      routes: [
        ShellRoute(
          builder: (context, state, child) => AuthGate(child: child),
          routes: [
            GoRoute(
              path: '/kiosk',
              builder: (context, state) => const AttendanceKioskPage(),
            ),
          ],
        ),
      ],
    );
  }

  return GoRouter(
    initialLocation: '/home',
    refreshListenable: session,
    routes: [
      ShellRoute(
        builder: (context, state, child) => AuthGate(child: child),
        routes: [
          StatefulShellRoute.indexedStack(
            builder: (context, state, navigationShell) {
              return EmployeeShell(navigationShell: navigationShell);
            },
            branches: buildEmployeeBranches(
              showStock: session.isAuthenticated && session.isFloorStaff,
            ),
          ),
        ],
      ),
    ],
  );
}

class AppRouterScope extends StatefulWidget {
  const AppRouterScope({super.key, required this.child});

  final Widget child;

  @override
  State<AppRouterScope> createState() => _AppRouterScopeState();
}

class _AppRouterScopeState extends State<AppRouterScope> {
  late AuthSession _session;
  late GoRouter _router;
  var _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _session = context.read<AuthSession>();
    _router = createAppRouter(_session);
    _session.addListener(_onSessionChanged);
  }

  void _onSessionChanged() {
    final next = createAppRouter(_session);
    _router.dispose();
    setState(() => _router = next);
  }

  @override
  void dispose() {
    if (_ready) {
      _session.removeListener(_onSessionChanged);
      _router.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const SizedBox.shrink();
    }
    return RouterScope(router: _router, child: widget.child);
  }
}

class RouterScope extends InheritedWidget {
  const RouterScope({
    super.key,
    required this.router,
    required super.child,
  });

  final GoRouter router;

  static GoRouter of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<RouterScope>()!.router;
  }

  @override
  bool updateShouldNotify(RouterScope oldWidget) => router != oldWidget.router;
}

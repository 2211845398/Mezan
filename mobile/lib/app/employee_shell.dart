import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../core/i18n/app_strings.dart';
import '../shared/widgets/mezan_number_text.dart';
import '../core/theme/mezan_theme.dart';
import '../features/auth/auth_session.dart';
import '../features/dashboard/dashboard_page.dart';
import '../features/notifications/notifications_controller.dart';
import '../features/notifications/notifications_page.dart';
import '../features/payroll/payroll_page.dart';
import '../features/my_leaves/create_leave_request_page.dart';
import '../features/my_leaves/my_leaves_page.dart';
import '../features/profile/profile_page.dart';
import '../features/stock/stock_page.dart';

class EmployeeShell extends StatefulWidget {
  const EmployeeShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  State<EmployeeShell> createState() => _EmployeeShellState();
}

class _EmployeeShellState extends State<EmployeeShell> {
  static const _branchNamesWithStock = [
    'home',
    'payroll',
    'myLeaves',
    'stock',
    'profile',
  ];
  static const _branchNamesNoStock = ['home', 'payroll', 'myLeaves', 'profile'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationsController>().refreshUnreadCount();
    });
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => const NotificationsPage()),
    );
    if (mounted) {
      await context.read<NotificationsController>().refreshUnreadCount();
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppStrings(Localizations.localeOf(context).languageCode);
    final session = context.watch<AuthSession>();
    final unreadCount = context.watch<NotificationsController>().unreadCount;
    final showStock = session.isFloorStaff;
    final branchIndex = widget.navigationShell.currentIndex;
    final navIndex = branchIndex;

    final scheme = Theme.of(context).colorScheme;
    final ext = MezanThemeExtension.of(context);
    final inactive = ext.mutedForeground;
    final active = scheme.secondary;

    final branchKey = (showStock ? _branchNamesWithStock : _branchNamesNoStock)[
        branchIndex];

    final destinations = <NavigationDestination>[
      NavigationDestination(
        icon: Icon(Icons.home_outlined, color: inactive),
        selectedIcon: Icon(Icons.home, color: active),
        label: strings.navHome,
      ),
      NavigationDestination(
        icon: Icon(Icons.payments_outlined, color: inactive),
        selectedIcon: Icon(Icons.payments, color: active),
        label: strings.navPayroll,
      ),
      NavigationDestination(
        icon: Icon(Icons.event_note_outlined, color: inactive),
        selectedIcon: Icon(Icons.event_note, color: active),
        label: strings.navMyLeaves,
      ),
      if (showStock)
        NavigationDestination(
          icon: Icon(Icons.inventory_2_outlined, color: inactive),
          selectedIcon: Icon(Icons.inventory_2, color: active),
          label: strings.navStock,
        ),
      NavigationDestination(
        icon: Icon(Icons.person_outline, color: inactive),
        selectedIcon: Icon(Icons.person, color: active),
        label: strings.navProfile,
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(_appBarTitle(branchKey, strings, session)),
        actions: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_outlined),
                onPressed: _openNotifications,
              ),
              if (unreadCount > 0)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: scheme.error,
                      shape: BoxShape.circle,
                    ),
                    constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                    child: MezanNumberText(
                      unreadCount > 99 ? '99+' : '$unreadCount',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onError,
                            fontSize: 10,
                          ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: widget.navigationShell,
      bottomNavigationBar: NavigationBar(
        indicatorColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        overlayColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.pressed)) {
            return active.withValues(alpha: 0.08);
          }
          return Colors.transparent;
        }),
        selectedIndex: navIndex,
        onDestinationSelected: (index) {
          if (index == 0) {
            context.read<NotificationsController>().refreshUnreadCount();
          }
          widget.navigationShell.goBranch(
            index,
            initialLocation: index == navIndex,
          );
        },
        destinations: destinations,
      ),
    );
  }

  String _appBarTitle(String branchKey, AppStrings strings, AuthSession session) {
    if (branchKey == 'home') {
      final name = session.employeeName;
      if (name != null && name.isNotEmpty) {
        return strings.greeting(name);
      }
    }
    return switch (branchKey) {
      'home' => strings.navHome,
      'payroll' => strings.navPayroll,
      'myLeaves' => strings.navMyLeaves,
      'stock' => strings.navStock,
      _ => strings.navProfile,
    };
  }
}

List<StatefulShellBranch> buildEmployeeBranches({required bool showStock}) {
  final branches = <StatefulShellBranch>[
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/home',
          builder: (context, state) => const DashboardPage(),
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/payroll',
          builder: (context, state) => const PayrollPage(),
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/my-leaves',
          builder: (context, state) => const MyLeavesPage(),
          routes: [
            GoRoute(
              path: 'new',
              builder: (context, state) => const CreateLeaveRequestPage(),
            ),
          ],
        ),
      ],
    ),
  ];

  if (showStock) {
    branches.add(
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/stock',
            builder: (context, state) => const StockPage(),
          ),
        ],
      ),
    );
  }

  branches.add(
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/profile',
          builder: (context, state) => const ProfilePage(),
        ),
      ],
    ),
  );

  return branches;
}

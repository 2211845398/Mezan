import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../core/i18n/app_strings.dart';
import '../shared/widgets/mezan_floating_nav_bar.dart';
import '../shared/widgets/mezan_number_text.dart';
import '../core/theme/mezan_theme.dart';
import '../features/auth/auth_session.dart';
import '../features/dashboard/dashboard_page.dart';
import '../features/notifications/notifications_controller.dart';
import '../features/notifications/notifications_page.dart';
import '../features/payroll/payroll_page.dart';
import '../features/my_leaves/create_leave_request_page.dart';
import '../features/my_leaves/leave_request_detail_page.dart';
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
    'myLeaves',
    'payroll',
    'stock',
    'profile',
  ];
  static const _branchNamesNoStock = ['home', 'myLeaves', 'payroll', 'profile'];

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
    final active = scheme.primary;

    final branchKey = (showStock ? _branchNamesWithStock : _branchNamesNoStock)[
        branchIndex];

    final navItems = <MezanFloatingNavItem>[
      MezanFloatingNavItem(
        icon: Icons.home_outlined,
        activeIcon: Icons.home,
        label: strings.navHome,
      ),
      MezanFloatingNavItem(
        icon: Icons.event_note_outlined,
        activeIcon: Icons.event_note,
        label: strings.navMyLeaves,
      ),
      MezanFloatingNavItem(
        icon: Icons.payments_outlined,
        activeIcon: Icons.payments,
        label: strings.navPayroll,
      ),
      if (showStock)
        MezanFloatingNavItem(
          icon: Icons.inventory_2_outlined,
          activeIcon: Icons.inventory_2,
          label: strings.navStock,
        ),
      MezanFloatingNavItem(
        icon: Icons.person_outline,
        activeIcon: Icons.person,
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
      bottomNavigationBar: MezanFloatingNavBar(
        items: navItems,
        selectedIndex: navIndex,
        activeColor: active,
        activeForegroundColor: Colors.white,
        inactiveColor: inactive,
        onSelected: (index) {
          if (index == 0) {
            context.read<NotificationsController>().refreshUnreadCount();
          }
          widget.navigationShell.goBranch(
            index,
            initialLocation: index == navIndex,
          );
        },
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
          path: '/my-leaves',
          builder: (context, state) => const MyLeavesPage(),
          routes: [
            GoRoute(
              path: 'new',
              builder: (context, state) => const CreateLeaveRequestPage(),
            ),
            GoRoute(
              path: ':id',
              builder: (context, state) {
                final id = int.tryParse(state.pathParameters['id'] ?? '') ?? 0;
                return LeaveRequestDetailPage(requestId: id);
              },
            ),
          ],
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

import 'package:flutter/material.dart';

/// Single destination definition for [MezanFloatingNavBar].
class MezanFloatingNavItem {
  const MezanFloatingNavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
}

/// A floating, pill-shaped bottom navigation bar with an animated
/// capsule indicator on the active tab (icon + label), matching the
/// modern mobile UI reference used across the app's onboarding shots.
class MezanFloatingNavBar extends StatelessWidget {
  const MezanFloatingNavBar({
    super.key,
    required this.items,
    required this.selectedIndex,
    required this.onSelected,
    required this.activeColor,
    required this.activeForegroundColor,
    required this.inactiveColor,
    this.backgroundColor = Colors.white,
  });

  final List<MezanFloatingNavItem> items;
  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final Color activeColor;
  final Color activeForegroundColor;
  final Color inactiveColor;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.only(left: 24, right: 24, bottom: 20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(30),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.10),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (var i = 0; i < items.length; i++)
                _FloatingNavTile(
                  item: items[i],
                  selected: i == selectedIndex,
                  activeColor: activeColor,
                  activeForegroundColor: activeForegroundColor,
                  inactiveColor: inactiveColor,
                  onTap: () => onSelected(i),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FloatingNavTile extends StatelessWidget {
  const _FloatingNavTile({
    required this.item,
    required this.selected,
    required this.activeColor,
    required this.activeForegroundColor,
    required this.inactiveColor,
    required this.onTap,
  });

  final MezanFloatingNavItem item;
  final bool selected;
  final Color activeColor;
  final Color activeForegroundColor;
  final Color inactiveColor;
  final VoidCallback onTap;

  static const _duration = Duration(milliseconds: 220);
  static const _curve = Curves.easeOutCubic;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: _duration,
        curve: _curve,
        padding: EdgeInsets.symmetric(
          horizontal: selected ? 16 : 12,
          vertical: 12,
        ),
        decoration: BoxDecoration(
          color: selected ? activeColor : Colors.transparent,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              selected ? item.activeIcon : item.icon,
              color: selected ? activeForegroundColor : inactiveColor,
              size: 22,
            ),
            ClipRect(
              child: AnimatedSize(
                duration: _duration,
                curve: _curve,
                child: selected
                    ? Padding(
                        padding: const EdgeInsetsDirectional.only(start: 8),
                        child: Text(
                          item.label,
                          style: TextStyle(
                            color: activeForegroundColor,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      )
                    : const SizedBox(height: 0, width: 0),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

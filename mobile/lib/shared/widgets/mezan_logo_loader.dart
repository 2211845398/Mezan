import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/theme/mezan_theme.dart';

/// Loading indicator: static Mezan logo with a gentle opacity pulse.
///
/// Motion is disabled when the platform requests reduced animations
/// (`MediaQuery.disableAnimations`).
class MezanLogoLoader extends StatefulWidget {
  const MezanLogoLoader({
    super.key,
    this.size = 96,
    this.label,
  });

  final double size;
  final String? label;

  @override
  State<MezanLogoLoader> createState() => _MezanLogoLoaderState();
}

class _MezanLogoLoaderState extends State<MezanLogoLoader>
    with SingleTickerProviderStateMixin {
  static const double _minOpacity = 0.45;

  late final AnimationController _controller;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    _opacity = Tween<double>(
      begin: 1,
      end: _minOpacity,
    ).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduceMotion) {
      _controller.stop();
      _controller.value = 1;
    } else if (!_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    final logo = SvgPicture.asset(
      'assets/branding/logo.svg',
      width: widget.size,
      height: widget.size * (1158 / 1268),
    );

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        FadeTransition(
          opacity: _opacity,
          child: logo,
        ),
        if (widget.label != null) ...[
          const SizedBox(height: 16),
          Text(
            widget.label!,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: ext.mutedForeground,
                ),
          ),
        ],
      ],
    );
  }
}

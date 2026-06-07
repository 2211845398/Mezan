import 'package:flutter/material.dart';

import '../../core/theme/mezan_radii.dart';
import '../../core/theme/mezan_theme.dart';

class MezanShimmer extends StatefulWidget {
  const MezanShimmer({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  State<MezanShimmer> createState() => _MezanShimmerState();
}

class _MezanShimmerState extends State<MezanShimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) {
            return LinearGradient(
              begin: Alignment(-1 + _controller.value * 2, 0),
              end: Alignment(1 + _controller.value * 2, 0),
              colors: [
                ext.muted,
                ext.mutedForeground.withValues(alpha: 0.25),
                ext.muted,
              ],
            ).createShader(bounds);
          },
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

class MezanShimmerBox extends StatelessWidget {
  const MezanShimmerBox({
    super.key,
    this.height = 16,
    this.width,
    this.radius = MezanRadii.md,
  });

  final double height;
  final double? width;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    return MezanShimmer(
      child: Container(
        height: height,
        width: width,
        decoration: BoxDecoration(
          color: ext.muted,
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
    );
  }
}

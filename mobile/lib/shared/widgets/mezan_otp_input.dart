import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/mezan_radii.dart';
import '../../core/theme/mezan_theme.dart';

const _otpLength = 6;

class MezanOtpInput extends StatefulWidget {
  const MezanOtpInput({
    super.key,
    required this.onChanged,
    this.onCompleted,
    this.enabled = true,
  });

  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onCompleted;
  final bool enabled;

  @override
  State<MezanOtpInput> createState() => _MezanOtpInputState();
}

class _MezanOtpInputState extends State<MezanOtpInput> {
  late final List<TextEditingController> _controllers;
  late final List<FocusNode> _focusNodes;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(_otpLength, (_) => TextEditingController());
    _focusNodes = List.generate(_otpLength, (_) => FocusNode());
  }

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    for (final node in _focusNodes) {
      node.dispose();
    }
    super.dispose();
  }

  String get _value => _controllers.map((c) => c.text).join();

  void _emit() {
    final value = _value;
    widget.onChanged(value);
    if (value.length == _otpLength) {
      widget.onCompleted?.call(value);
    }
  }

  void _handleChanged(int index, String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      _controllers[index].clear();
      _emit();
      return;
    }

    if (digits.length == 1) {
      _controllers[index].text = digits;
      _controllers[index].selection = const TextSelection.collapsed(offset: 1);
      if (index < _otpLength - 1) {
        _focusNodes[index + 1].requestFocus();
      }
      _emit();
      return;
    }

    var cursor = index;
    for (var i = 0; i < digits.length && cursor < _otpLength; i++) {
      _controllers[cursor].text = digits[i];
      cursor += 1;
    }
    if (cursor < _otpLength) {
      _focusNodes[cursor].requestFocus();
    } else {
      _focusNodes[_otpLength - 1].unfocus();
    }
    _emit();
  }

  KeyEventResult _handleKey(int index, KeyEvent event) {
    if (event is! KeyDownEvent || event.logicalKey != LogicalKeyboardKey.backspace) {
      return KeyEventResult.ignored;
    }
    if (_controllers[index].text.isEmpty && index > 0) {
      _focusNodes[index - 1].requestFocus();
      _controllers[index - 1].clear();
      _emit();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final ext = MezanThemeExtension.of(context);
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(MezanRadii.md),
      borderSide: BorderSide(color: ext.border),
    );

    return Directionality(
      textDirection: TextDirection.ltr,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(_otpLength, (index) {
          return Padding(
            padding: EdgeInsetsDirectional.only(
              end: index == _otpLength - 1 ? 0 : 8,
            ),
            child: SizedBox(
              width: 44,
              child: Focus(
                onKeyEvent: (node, event) => _handleKey(index, event),
                child: TextField(
                  controller: _controllers[index],
                  focusNode: _focusNodes[index],
                  enabled: widget.enabled,
                  textAlign: TextAlign.center,
                  keyboardType: TextInputType.number,
                  textInputAction:
                      index == _otpLength - 1 ? TextInputAction.done : TextInputAction.next,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(1),
                  ],
                  style: Theme.of(context).textTheme.titleMedium,
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    border: border,
                    enabledBorder: border,
                    focusedBorder: border.copyWith(
                      borderSide: BorderSide(color: ext.ring, width: 1.5),
                    ),
                  ),
                  onChanged: (value) => _handleChanged(index, value),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

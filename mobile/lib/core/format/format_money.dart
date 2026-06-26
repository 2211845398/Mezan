import 'package:intl/intl.dart';

/// Money formatting with Latin digits (web `.num-latin`).
/// UI locale is ignored for digits — always uses `en`.
String formatMoney(
  num amount, {
  String locale = 'en',
  String? currencySymbol,
  int decimalDigits = 2,
}) {
  final formatter = NumberFormat.currency(
    locale: 'en',
    symbol: currencySymbol ?? '',
    decimalDigits: decimalDigits,
  );
  return formatter.format(amount).trim();
}

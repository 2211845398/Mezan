const _easternArabicDigits = '٠١٢٣٤٥٦٧٨٩';
const _persianDigits = '۰۱۲۳۴۵۶۷۸۹';

/// Normalize Eastern Arabic / Persian digits to Western Arabic (0-9).
String toLatinDigits(String input) {
  final buffer = StringBuffer();
  for (final rune in input.runes) {
    final ch = String.fromCharCode(rune);
    final eastern = _easternArabicDigits.indexOf(ch);
    if (eastern >= 0) {
      buffer.write(eastern);
      continue;
    }
    final persian = _persianDigits.indexOf(ch);
    if (persian >= 0) {
      buffer.write(persian);
      continue;
    }
    buffer.write(ch);
  }
  return buffer.toString();
}

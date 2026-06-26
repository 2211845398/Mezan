import 'app_config.dart';

/// Resolve API-relative asset paths (e.g. avatar URLs) to absolute URLs.
String resolveApiAssetUrl(String? path) {
  if (path == null || path.isEmpty) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  final base = Uri.parse(AppConfig.apiBaseUrl);
  final origin = Uri(
    scheme: base.scheme,
    host: base.host,
    port: base.hasPort ? base.port : null,
  );
  if (path.startsWith('/')) {
    return origin.resolve(path).toString();
  }
  return '${AppConfig.apiBaseUrl}/$path';
}

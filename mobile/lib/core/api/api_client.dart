import 'package:dio/dio.dart';

import '../config/app_config.dart';
import 'api_exception.dart';
import 'token_storage.dart';

class ApiClient {
  ApiClient({required TokenStorage tokenStorage})
      : _tokenStorage = tokenStorage,
        _dio = Dio(
          BaseOptions(
            baseUrl: AppConfig.apiBaseUrl,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 30),
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
          ),
        ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = _tokenStorage.accessToken;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          final locale = _localeHeader;
          if (locale != null) {
            options.headers['Accept-Language'] = locale;
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final response = error.response;
          final options = error.requestOptions;
          final skipRefresh = _shouldSkipRefresh(options.path);

          if (response?.statusCode == 401 &&
              !skipRefresh &&
              options.extra['_retry'] != true) {
            final newToken = await _refreshAccessToken();
            if (newToken != null) {
              options.extra['_retry'] = true;
              options.headers['Authorization'] = 'Bearer $newToken';
              try {
                final retry = await _dio.fetch(options);
                return handler.resolve(retry);
              } catch (e) {
                if (e is DioException) return handler.next(e);
              }
            }
            await _tokenStorage.clearAll();
            _onSessionExpired?.call();
          }

          handler.next(error);
        },
      ),
    );
  }

  final TokenStorage _tokenStorage;
  final Dio _dio;

  String? _localeHeader;
  Future<String?>? _refreshInflight;
  void Function()? _onSessionExpired;

  Dio get dio => _dio;

  void setLocaleHeader(String? locale) {
    _localeHeader = locale;
  }

  void setOnSessionExpired(void Function() callback) {
    _onSessionExpired = callback;
  }

  static final _refreshSkipPaths = [
    RegExp(r'/auth/login$'),
    RegExp(r'/auth/refresh$'),
    RegExp(r'/auth/logout$'),
  ];

  bool _shouldSkipRefresh(String path) {
    return _refreshSkipPaths.any((re) => re.hasMatch(path));
  }

  Future<String?> _refreshAccessToken() async {
    _refreshInflight ??= _doRefresh();
    try {
      return await _refreshInflight;
    } finally {
      _refreshInflight = null;
    }
  }

  Future<String?> _doRefresh() async {
    final refresh = await _tokenStorage.readRefreshToken();
    if (refresh == null || refresh.isEmpty) return null;
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refresh_token': refresh},
        options: Options(extra: {'_retry': true}),
      );
      final token = response.data?['access_token'] as String?;
      if (token != null && token.isNotEmpty) {
        _tokenStorage.setAccessToken(token);
        return token;
      }
    } on DioException {
      await _tokenStorage.clearRefreshToken();
    }
    return null;
  }

  Future<Map<String, dynamic>> getMap(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    return _map(() => _dio.get<Map<String, dynamic>>(
          path,
          queryParameters: queryParameters,
        ));
  }

  Future<dynamic> getJson(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        path,
        queryParameters: queryParameters,
      );
      return response.data;
    } on DioException catch (e) {
      throw _toApiException(e);
    }
  }

  Future<Map<String, dynamic>> postMap(
    String path, {
    Object? data,
    Options? options,
  }) async {
    return _map(() => _dio.post<Map<String, dynamic>>(
          path,
          data: data,
          options: options,
        ));
  }

  Future<void> postVoid(
    String path, {
    Object? data,
    Options? options,
  }) async {
    try {
      await _dio.post(path, data: data, options: options);
    } on DioException catch (e) {
      throw _toApiException(e);
    }
  }

  Future<void> deleteVoid(
    String path, {
    Options? options,
  }) async {
    try {
      await _dio.delete(path, options: options);
    } on DioException catch (e) {
      throw _toApiException(e);
    }
  }

  Future<T> patch<T>(
    String path, {
    Object? data,
  }) async {
    return _map(() => _dio.patch<Map<String, dynamic>>(
          path,
          data: data,
        ));
  }

  Future<Map<String, dynamic>> postMultipartMap(
    String path, {
    required String fieldName,
    required List<int> bytes,
    required String filename,
  }) async {
    return _map(() => _dio.post<Map<String, dynamic>>(
          path,
          data: FormData.fromMap({
            fieldName: MultipartFile.fromBytes(bytes, filename: filename),
          }),
          options: Options(
            contentType: 'multipart/form-data',
          ),
        ));
  }

  Future<T> _map<T>(Future<Response<Map<String, dynamic>>> Function() call) async {
    try {
      final response = await call();
      final data = response.data;
      if (data is T) return data as T;
      if (T == Map<String, dynamic>) {
        return (data ?? <String, dynamic>{}) as T;
      }
      return data as T;
    } on DioException catch (e) {
      throw _toApiException(e);
    }
  }

  ApiException _toApiException(DioException e) {
    final response = e.response;
    String message = e.message ?? 'Network error';
    String? code;

    final body = response?.data;
    if (body is Map<String, dynamic>) {
      final envelope = body['error'];
      if (envelope is Map<String, dynamic>) {
        if (envelope['code'] is String) code = envelope['code'] as String;
        final details = envelope['details'];
        if (details is Map<String, dynamic>) {
          final inner = details['detail'];
          if (inner is String && inner.isNotEmpty) {
            message = inner;
          }
        }
        if (message == e.message && envelope['message'] is String) {
          message = envelope['message'] as String;
        }
      }

      final detail = body['detail'];
      if (detail is String) {
        message = detail;
      } else if (detail is List && detail.isNotEmpty) {
        final first = detail.first;
        if (first is Map && first['msg'] is String) {
          message = first['msg'] as String;
        }
      }
      if (code == null && body['code'] is String) code = body['code'] as String;
    }

    return ApiException(
      message: message,
      statusCode: response?.statusCode,
      code: code,
    );
  }
}

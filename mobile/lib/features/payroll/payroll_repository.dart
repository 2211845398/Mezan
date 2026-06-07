import '../../../core/api/api_client.dart';
import 'models/payslip_read.dart';

class PayrollRepository {
  PayrollRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<PayslipListResponse> getMyPayslips({
    int? year,
    int limit = 24,
    int offset = 0,
  }) async {
    final query = <String, dynamic>{
      'limit': limit,
      'offset': offset,
    };
    if (year != null) query['year'] = year;

    final data = await _api.getMap(
      '/payroll/me/payslips',
      queryParameters: query,
    );
    return PayslipListResponse.fromJson(data);
  }

  Future<PayslipRead> getMyPayslipForMonth({
    required int year,
    required int month,
  }) async {
    final data = await _api.getMap('/payroll/me/payslips/$year/$month');
    return PayslipRead.fromJson(data);
  }
}

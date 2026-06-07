import '../../../core/api/api_client.dart';
import '../auth/models/branch_brief.dart';
import 'models/stock_finder_result.dart';

class StockRepository {
  StockRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<List<BranchBrief>> listBranches() async {
    final data = await _api.getJson('/inventory/stock-finder/branches');
    if (data is! List) return const [];
    return data
        .map((e) => BranchBrief.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<StockFinderResult>> search({
    required String query,
    int? branchId,
    int limit = 25,
  }) async {
    final q = query.trim();
    if (q.isEmpty) return const [];

    final params = <String, dynamic>{
      'q': q,
      'limit': limit,
    };
    if (branchId != null) params['branch_id'] = branchId;

    final data = await _api.getJson(
      '/inventory/stock-finder',
      queryParameters: params,
    );
    if (data is! List) return const [];
    return data
        .map((e) => StockFinderResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

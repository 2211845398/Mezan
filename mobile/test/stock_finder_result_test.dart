import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/stock/models/stock_finder_result.dart';

void main() {
  test('parses grouped stock finder payload', () {
    final result = StockFinderResult.fromJson({
      'product_id': 1,
      'variant_id': 10,
      'product_name': 'Shirt',
      'variant_name': 'Shirt / M',
      'sku': 'SH-1',
      'variant_sku': 'SH-1-M',
      'barcode': '12345',
      'current_branch': {
        'branch_id': 2,
        'branch_name': 'Main',
        'available': 5,
        'on_hand': 6,
        'reserved': 1,
        'damaged': 0,
        'in_transit_in': 2,
      },
      'other_branches': [
        {
          'branch_id': 3,
          'branch_name': 'East',
          'available': 1,
          'on_hand': 1,
          'reserved': 0,
          'damaged': 0,
          'in_transit_in': 0,
        },
      ],
    });

    expect(result.displaySku, 'SH-1-M');
    expect(result.hasAnyStock, isTrue);
    expect(result.currentBranch?.available, 5);
    expect(result.otherBranches, hasLength(1));
  });
}

class StockFinderBranchQty {
  const StockFinderBranchQty({
    required this.branchId,
    required this.branchName,
    required this.available,
    required this.onHand,
    required this.reserved,
    required this.damaged,
    this.inTransitIn = 0,
  });

  factory StockFinderBranchQty.fromJson(Map<String, dynamic> json) {
    return StockFinderBranchQty(
      branchId: json['branch_id'] as int,
      branchName: json['branch_name'] as String? ?? '',
      available: json['available'] as int? ?? 0,
      onHand: json['on_hand'] as int? ?? 0,
      reserved: json['reserved'] as int? ?? 0,
      damaged: json['damaged'] as int? ?? 0,
      inTransitIn: json['in_transit_in'] as int? ?? 0,
    );
  }

  final int branchId;
  final String branchName;
  final int available;
  final int onHand;
  final int reserved;
  final int damaged;
  final int inTransitIn;
}

class StockFinderResult {
  const StockFinderResult({
    required this.productId,
    required this.variantId,
    required this.productName,
    required this.variantName,
    required this.sku,
    this.variantSku = '',
    this.barcode = '',
    this.currentBranch,
    this.otherBranches = const [],
  });

  factory StockFinderResult.fromJson(Map<String, dynamic> json) {
    final others = json['other_branches'];
    return StockFinderResult(
      productId: json['product_id'] as int,
      variantId: json['variant_id'] as int,
      productName: json['product_name'] as String? ?? '',
      variantName: json['variant_name'] as String? ?? '',
      sku: json['sku'] as String? ?? '',
      variantSku: json['variant_sku'] as String? ?? '',
      barcode: json['barcode'] as String? ?? '',
      currentBranch: json['current_branch'] == null
          ? null
          : StockFinderBranchQty.fromJson(
              json['current_branch'] as Map<String, dynamic>,
            ),
      otherBranches: others is List
          ? others
              .map(
                (e) => StockFinderBranchQty.fromJson(
                  e as Map<String, dynamic>,
                ),
              )
              .toList()
          : const [],
    );
  }

  final int productId;
  final int variantId;
  final String productName;
  final String variantName;
  final String sku;
  final String variantSku;
  final String barcode;
  final StockFinderBranchQty? currentBranch;
  final List<StockFinderBranchQty> otherBranches;

  String get displaySku =>
      variantSku.isNotEmpty ? variantSku : sku;

  bool get hasAnyStock {
    final cur = currentBranch?.available ?? 0;
    if (cur > 0) return true;
    return otherBranches.any((b) => b.available > 0);
  }
}

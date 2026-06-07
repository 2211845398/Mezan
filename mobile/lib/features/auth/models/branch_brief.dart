class BranchBrief {
  const BranchBrief({
    required this.id,
    required this.name,
    this.code,
  });

  factory BranchBrief.fromJson(Map<String, dynamic> json) {
    return BranchBrief(
      id: json['id'] as int,
      name: json['name'] as String,
      code: json['code'] as String?,
    );
  }

  final int id;
  final String name;
  final String? code;
}

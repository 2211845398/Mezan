class EmployeeProfileRead {
  const EmployeeProfileRead({
    required this.employeeProfileId,
    required this.userId,
    required this.fullName,
    this.email,
    this.phone,
    this.avatarUrl,
    this.branchId,
    this.branchName,
    this.roleCodes = const [],
    this.roleName,
    this.hireDate,
  });

  factory EmployeeProfileRead.fromJson(Map<String, dynamic> json) {
    final roles = json['role_codes'];
    return EmployeeProfileRead(
      employeeProfileId: json['employee_profile_id'] as int,
      userId: json['user_id'] as int,
      fullName: json['full_name'] as String? ?? '',
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      branchId: json['branch_id'] as int?,
      branchName: json['branch_name'] as String?,
      roleCodes: roles is List ? roles.map((e) => e.toString()).toList() : const [],
      roleName: json['role_name'] as String?,
      hireDate: json['hire_date'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'employee_profile_id': employeeProfileId,
        'user_id': userId,
        'full_name': fullName,
        'email': email,
        'phone': phone,
        'avatar_url': avatarUrl,
        'branch_id': branchId,
        'branch_name': branchName,
        'role_codes': roleCodes,
        'role_name': roleName,
        'hire_date': hireDate,
      };

  final int employeeProfileId;
  final int userId;
  final String fullName;
  final String? email;
  final String? phone;
  final String? avatarUrl;
  final int? branchId;
  final String? branchName;
  final List<String> roleCodes;
  final String? roleName;
  final String? hireDate;

  String get badgeQrPayload => 'mezan:employee:v1:$employeeProfileId';

  String get rolesLabel =>
      roleCodes.isNotEmpty ? roleCodes.join(', ') : (roleName ?? '—');
}

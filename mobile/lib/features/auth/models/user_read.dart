class UserRead {
  const UserRead({
    required this.id,
    required this.email,
    required this.status,
    this.firstName,
    this.fatherName,
    this.familyName,
    this.branchId,
    this.branchName,
    this.phone,
    this.city,
    this.preferredLanguage,
    this.avatarUrl,
    this.lastLoginAt,
    this.employeeProfileId,
    this.mustChangePassword = false,
    this.twoFactorEnabled = false,
  });

  factory UserRead.fromJson(Map<String, dynamic> json) {
    return UserRead(
      id: json['id'] as int,
      email: json['email'] as String,
      status: json['status'] as String,
      firstName: json['first_name'] as String?,
      fatherName: json['father_name'] as String?,
      familyName: json['family_name'] as String?,
      branchId: json['branch_id'] as int?,
      branchName: json['branch_name'] as String?,
      phone: json['phone'] as String?,
      city: json['city'] as String?,
      preferredLanguage: json['preferred_language'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      lastLoginAt: json['last_login_at'] as String?,
      employeeProfileId: json['employee_profile_id'] as int?,
      mustChangePassword: json['must_change_password'] == true,
      twoFactorEnabled: json['two_factor_enabled'] == true,
    );
  }

  final int id;
  final String email;
  final String status;
  final String? firstName;
  final String? fatherName;
  final String? familyName;
  final int? branchId;
  final String? branchName;
  final String? phone;
  final String? city;
  final String? preferredLanguage;
  final String? avatarUrl;
  final String? lastLoginAt;
  final int? employeeProfileId;
  final bool mustChangePassword;
  final bool twoFactorEnabled;

  String get displayName {
    final parts = [firstName, fatherName, familyName]
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty);
    if (parts.isNotEmpty) return parts.join(' ');
    return email;
  }

  bool get hasEmployeeProfile =>
      employeeProfileId != null && employeeProfileId! > 0;
}

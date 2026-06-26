class ProfileUpdate {
  const ProfileUpdate({
    this.email,
    this.firstName,
    this.fatherName,
    this.familyName,
    this.phone,
    this.city,
    this.preferredLanguage,
    this.currentPassword,
    this.newPassword,
  });

  final String? email;
  final String? firstName;
  final String? fatherName;
  final String? familyName;
  final String? phone;
  final String? city;
  final String? preferredLanguage;
  final String? currentPassword;
  final String? newPassword;

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{};
    if (email != null) map['email'] = email;
    if (firstName != null) map['first_name'] = firstName;
    if (fatherName != null) map['father_name'] = fatherName;
    if (familyName != null) map['family_name'] = familyName;
    if (phone != null) map['phone'] = phone;
    if (city != null) map['city'] = city;
    if (preferredLanguage != null) {
      map['preferred_language'] = preferredLanguage;
    }
    if (currentPassword != null) map['current_password'] = currentPassword;
    if (newPassword != null) map['new_password'] = newPassword;
    return map;
  }
}

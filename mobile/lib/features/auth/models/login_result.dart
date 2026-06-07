class LoginResult {
  const LoginResult({
    this.accessToken,
    this.refreshToken,
    this.requires2fa = false,
    this.challengeToken,
    this.mustChangePassword = false,
  });

  final String? accessToken;
  final String? refreshToken;
  final bool requires2fa;
  final String? challengeToken;
  final bool mustChangePassword;

  bool get hasTokens =>
      accessToken != null &&
      accessToken!.isNotEmpty &&
      refreshToken != null &&
      refreshToken!.isNotEmpty;
}

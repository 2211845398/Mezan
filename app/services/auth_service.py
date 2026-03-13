"""Authentication service (placeholder)."""


async def authenticate_user(email: str, password: str) -> dict:
    """
    Authenticate a user by email and password.

    This is a placeholder implementation. Replace with real
    authentication logic (e.g., bcrypt password verification,
    JWT token generation) in production.

    Args:
        email: User's email address.
        password: User's password.

    Returns:
        dict with 'message' and 'authenticated' keys.
    """
    # TODO: Implement real authentication logic
    return {
        "message": "Authentication not yet implemented",
        "authenticated": False,
    }
